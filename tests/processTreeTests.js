const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
    const failingTaskkill = path.join(systemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const fallbackEnv = {
      ...process.env,
      FLOWLAB_TASKKILL_EXE: failingTaskkill,
    };
    let fallbackRun;
    fallbackRun = await startAndTimeOut(tempDir, fallbackEnv);
    await assert.rejects(fallbackRun.command, error => {
      const matches = /Quá thời gian thực thi cho phép/.test(error.message)
        && error.processTreeFallbackUsed === true
        && error.processTreePrimaryExecutable === failingTaskkill
        && Boolean(error.processTreePrimaryError);
      if (!matches) console.error(`Unexpected taskkill fallback result: ${error.message}; fallback=${error.processTreeFallbackUsed}; executable=${error.processTreePrimaryExecutable}; primary=${error.processTreePrimaryError}`);
      return matches;
    },
    'A non-taskkill primary helper must fail and the system taskkill fallback must preserve the timeout result');
    passed++;
    assert.ok(await waitForProcessesToExit([fallbackRun.pids.parent, fallbackRun.pids.child], 2000),
      'The system taskkill fallback must terminate parent and descendant');
    passed++;
    await assertHeartbeatStops(fallbackRun.heartbeatFile);
    passed++;
    console.log('✅ Windows failing primary helper: system taskkill fallback terminated captured tree and heartbeat stopped');

    const unverifiedEnv = {
      ...process.env,
      FLOWLAB_TASKKILL_EXE: failingTaskkill,
      FLOWLAB_TEST_DISABLE_PROCESS_FALLBACK: '1',
    };
    let unverified;
    let terminationError;
    const unverifiedStarted = Date.now();
    unverified = await startAndTimeOut(tempDir, unverifiedEnv);
    await assert.rejects(unverified.command, error => {
      terminationError = error;
      return error?.processTreeTerminationVerified === false
        && /Không xác minh được việc dừng toàn bộ cây tiến trình/.test(error.message)
        && error.message.includes(failingTaskkill)
        && /deadline|remaining/i.test(error.message);
    }, 'Failure to confirm cleanup when fallback is unavailable must be surfaced as unverified termination');
    assert.ok(Date.now() - unverifiedStarted < 10000, 'Unverified shutdown must still settle in a bounded interval');
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

