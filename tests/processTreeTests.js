const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { execFileWithTimeout } = require('../server/dist/runner/cppRunner.js');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForJson(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { await delay(25); }
  }
  throw new Error('Timed process-tree fixture did not publish its PID metadata');
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform !== 'win32') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const processState = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[0];
      return processState !== 'Z';
    }
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function waitForProcessesToExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every(pid => !pidIsAlive(pid))) return true;
    await delay(50);
  }
  return pids.every(pid => !pidIsAlive(pid));
}

function compileFailureTool(outputPath) {
  const source = path.join(__dirname, 'processTreeToolFailure.c');
  const build = spawnSync('g++', [source, '-o', outputPath], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(build.status, 0, `Could not compile deterministic process-tree command failure fixture: ${build.stderr}`);
}

async function startAndTimeOut(tempDir, env) {
  const fixture = path.join(__dirname, 'processTreeChild.js');
  const pidFile = path.join(tempDir, 'pids.json');
  const heartbeatFile = path.join(tempDir, 'heartbeat.txt');
  const command = execFileWithTimeout(process.execPath, [fixture, 'parent', pidFile, heartbeatFile], { cwd: tempDir, env }, 1800);
  const pids = await waitForJson(pidFile, 1200);
  assert.ok(pids.parent > 0 && pids.child > 0, 'Fixture must publish parent and descendant PIDs');
  if (process.platform !== 'win32') {
    assert.strictEqual(pids.parentGroup, pids.parent,
      `POSIX command must lead its own process group (parent ${pids.parent}, group ${pids.parentGroup})`);
    assert.strictEqual(pids.childGroup, pids.parentGroup,
      `Descendant must inherit the execution process group (child ${pids.child}, group ${pids.childGroup})`);
  }
  return { command, pids, heartbeatFile };
}

async function assertHeartbeatStops(heartbeatFile) {
  const before = fs.existsSync(heartbeatFile) ? fs.readFileSync(heartbeatFile, 'utf8') : '';
  await delay(200);
  const after = fs.existsSync(heartbeatFile) ? fs.readFileSync(heartbeatFile, 'utf8') : '';
  assert.strictEqual(after, before, 'A descendant must stop writing immediately after process-tree termination');
}

async function runProcessTreeTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlab-process-tree-'));
  let passed = 0;
  const total = process.platform === 'win32' ? 8 : 4;
  try {
    const baseline = await startAndTimeOut(tempDir, process.env);
    const startedAt = Date.now();
    await assert.rejects(baseline.command, error => {
      if (!/Quá thời gian thực thi cho phép/.test(error.message)) console.error(`Unexpected process-tree termination: ${error.message}`);
      return /Quá thời gian thực thi cho phép/.test(error.message);
    }, 'Timeout must settle with the configured timeout error');
    assert.ok(Date.now() - startedAt < 8000, 'Timeout termination must settle within a bounded interval');
    passed++;
    assert.ok(await waitForProcessesToExit([baseline.pids.parent, baseline.pids.child], 1500),
      'The command and its descendant must be gone before timeout cleanup completes');
    passed++;
    await assertHeartbeatStops(baseline.heartbeatFile);
    passed++;
    if (process.platform !== 'win32') {
      assert.strictEqual(baseline.pids.parentGroup, baseline.pids.parent,
        'POSIX command must run in a detached process group');
      passed++;
      console.log('✅ POSIX process-tree regression: detached group terminated, Promise settled, descendant stopped');
      return { passed, failed: 0, total };
    }

    const toolsDir = path.join(tempDir, 'failing-tools');
    fs.mkdirSync(toolsDir);
    const fakeTaskkill = path.join(toolsDir, 'taskkill.exe');
    compileFailureTool(fakeTaskkill);
    const taskkillMarker = path.join(tempDir, 'taskkill-failed.log');
    const fallbackEnv = {
      ...process.env,
      PATH: `${toolsDir}${path.delimiter}${process.env.PATH}`,
      FLOWLAB_TOOL_FAILURE_MARKER: taskkillMarker,
      FLOWLAB_TASKKILL_EXE: fakeTaskkill,
    };
    const previousPath = process.env.PATH;
    const previousMarker = process.env.FLOWLAB_TOOL_FAILURE_MARKER;
    let fallbackRun;
    process.env.PATH = fallbackEnv.PATH;
    process.env.FLOWLAB_TOOL_FAILURE_MARKER = taskkillMarker;
    try {
      fallbackRun = await startAndTimeOut(tempDir, fallbackEnv);
      await assert.rejects(fallbackRun.command, /Quá thời gian thực thi cho phép/,
        'A failed primary taskkill must still finish with its original timeout reason after verified fallback');
    } finally {
      process.env.PATH = previousPath;
      if (previousMarker === undefined) delete process.env.FLOWLAB_TOOL_FAILURE_MARKER;
      else process.env.FLOWLAB_TOOL_FAILURE_MARKER = previousMarker;
    }
    assert.ok(fs.existsSync(taskkillMarker), 'The injected taskkill executable must actually run and fail');
    passed++;
    assert.ok(await waitForProcessesToExit([fallbackRun.pids.parent, fallbackRun.pids.child], 2000),
      'The real PowerShell fallback must terminate parent and descendant');
    passed++;
    await assertHeartbeatStops(fallbackRun.heartbeatFile);
    passed++;
    console.log('✅ Windows injected taskkill failure: PowerShell fallback terminated captured tree and heartbeat stopped');

    const unverifiedDir = path.join(tempDir, 'unverified-tools');
    fs.mkdirSync(unverifiedDir);
    compileFailureTool(path.join(unverifiedDir, 'taskkill.exe'));
    const unverifiedMarker = path.join(tempDir, 'unverified-helper-failed.log');
    const missingPowerShell = path.join(unverifiedDir, 'missing-powershell.exe');
    const unverifiedEnv = {
      ...process.env,
      PATH: `${unverifiedDir}${path.delimiter}${process.env.PATH}`,
      FLOWLAB_TOOL_FAILURE_MARKER: unverifiedMarker,
      FLOWLAB_TASKKILL_EXE: path.join(unverifiedDir, 'taskkill.exe'),
      FLOWLAB_POWERSHELL_EXE: missingPowerShell,
    };
    const savedPath = process.env.PATH;
    const savedMarker = process.env.FLOWLAB_TOOL_FAILURE_MARKER;
    const savedPowerShell = process.env.FLOWLAB_POWERSHELL_EXE;
    let unverified;
    let terminationError;
    const unverifiedStarted = Date.now();
    process.env.PATH = unverifiedEnv.PATH;
    process.env.FLOWLAB_TOOL_FAILURE_MARKER = unverifiedMarker;
    process.env.FLOWLAB_POWERSHELL_EXE = missingPowerShell;
    try {
      unverified = await startAndTimeOut(tempDir, unverifiedEnv);
      await assert.rejects(unverified.command, error => {
        terminationError = error;
        return error?.processTreeTerminationVerified === false
          && /Không xác minh được việc dừng toàn bộ cây tiến trình/.test(error.message)
          && error.message.includes(missingPowerShell);
      }, 'Failure to launch/complete the fallback must be surfaced as unverified termination');
    } finally {
      process.env.PATH = savedPath;
      if (savedMarker === undefined) delete process.env.FLOWLAB_TOOL_FAILURE_MARKER;
      else process.env.FLOWLAB_TOOL_FAILURE_MARKER = savedMarker;
      if (savedPowerShell === undefined) delete process.env.FLOWLAB_POWERSHELL_EXE;
      else process.env.FLOWLAB_POWERSHELL_EXE = savedPowerShell;
    }
    assert.ok(Date.now() - unverifiedStarted < 10000, 'Unverified shutdown must still settle in a bounded interval');
    assert.ok(fs.existsSync(unverifiedMarker), 'The injected taskkill executable must actually run and fail');
    const failedCommands = fs.readFileSync(unverifiedMarker, 'utf8').trim().split(/\r?\n/);
    assert.ok(failedCommands.length >= 1, 'The injected taskkill executable must fail before the missing PowerShell fallback is reported');
    passed++;
    console.log(`✅ Windows unverified termination surfaced for PID ${terminationError.rootPid}; no success was claimed`);

    // This test intentionally prevents the production fallback from working;
    // clean the fixture explicitly so the test itself never leaves an orphan.
    for (const pid of [unverified.pids.child, unverified.pids.parent]) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* It may already have exited. */ }
    }
    assert.ok(await waitForProcessesToExit([unverified.pids.parent, unverified.pids.child], 2000),
      'The test harness must clean the deliberately unverified fixture after observing the failure');
    passed++;
    console.log('✅ Windows explicit harness cleanup completed after asserting the production cleanup was unverified');
    return { passed, failed: 0, total };
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    } catch (error) {
      throw new Error(`Process-tree fixture cleanup failed at ${tempDir}: ${error.message}`);
    }
  }
}

if (require.main === module) {
  runProcessTreeTests().then(summary => {
    console.log(`Process-tree assertions: ${summary.passed}/${summary.total}`);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runProcessTreeTests };
