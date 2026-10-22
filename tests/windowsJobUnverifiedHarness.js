const fs = require('fs');
const path = require('path');
const { runCppCode } = require('../server/dist/runner/cppRunner.js');

async function main() {
  const homeDir = process.argv[2];
  process.env.USERPROFILE = homeDir;
  process.env.FLOWLAB_GDB_TIMEOUT_MS = '1200';
  process.env.FLOWLAB_MAX_STEPS = '1000000000';
  process.env.FLOWLAB_TEST_JOB_IGNORE_TERMINATE = '1';

  const loopingCode = 'int main() { volatile unsigned long n = 0; while (true) ++n; }';
  const startedAt = Date.now();
  const unverified = await runCppCode(loopingCode, '');
  const elapsedMs = Date.now() - startedAt;
  if (unverified.success || unverified.terminationStatus !== 'interrupted'
      || !/shutdown deadline/i.test(unverified.terminationReason || '') || unverified.trace.length !== 0) {
    throw new Error(`Unverified GDB cleanup was not surfaced fail-closed: ${JSON.stringify(unverified)}`);
  }

  const workspaceRoot = path.join(homeDir, '.dsa_flowlab_tmp');
  const retainedAfterUnverified = fs.readdirSync(workspaceRoot);
  if (retainedAfterUnverified.length !== 1) {
    throw new Error(`Unverified process ownership should retain exactly one workspace; found ${retainedAfterUnverified.length}`);
  }

  delete process.env.FLOWLAB_GDB_TIMEOUT_MS;
  delete process.env.FLOWLAB_MAX_STEPS;
  const successCode = '#include <iostream>\nint main(){ std::cout << "RECOVERED"; return 0; }';
  const remainingSlots = Array.from({ length: 7 }, () => runCppCode(successCode, ''));
  const saturated = await runCppCode(successCode, '');
  if (saturated.success || !/đang bận/.test(saturated.buildOutput || '')) {
    throw new Error(`An unverified run released its execution slot: ${JSON.stringify(saturated)}`);
  }
  const recovered = await Promise.all(remainingSlots);
  if (!recovered.every(result => result.success && result.finalStdout.trim() === 'RECOVERED')) {
    throw new Error(`Verified successful runs did not recover the remaining seven slots: ${JSON.stringify(recovered.map(result => ({ success: result.success, output: result.finalStdout, reason: result.terminationReason, buildOutput: result.buildOutput })))}`);
  }
  const retainedAfterRecovery = fs.readdirSync(workspaceRoot);
  if (retainedAfterRecovery.length !== 1 || retainedAfterRecovery[0] !== retainedAfterUnverified[0]) {
    throw new Error('Normal completion removed or changed the workspace retained for the unverified process tree');
  }

  console.log(`FLOWLAB_UNVERIFIED_HARNESS=${JSON.stringify({
    status: unverified.terminationStatus,
    reason: unverified.terminationReason,
    elapsedMs,
    retainedWorkspace: path.join(workspaceRoot, retainedAfterRecovery[0]),
    retainedCount: retainedAfterRecovery.length,
    saturatedRejected: true,
    sevenSuccessfulExecutions: recovered.length,
  })}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
