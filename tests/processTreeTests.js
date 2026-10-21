const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileWithTimeout } = require('../server/dist/runner/cppRunner.js');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForJson(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      await delay(25);
    }
  }
  throw new Error('Timed process-tree fixture did not publish its PID metadata');
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
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

async function runProcessTreeTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlab-process-tree-'));
  const fixture = path.join(__dirname, 'processTreeChild.js');
  const pidFile = path.join(tempDir, 'pids.json');
  const heartbeatFile = path.join(tempDir, 'heartbeat.txt');
  const command = execFileWithTimeout(process.execPath, [fixture, 'parent', pidFile, heartbeatFile], { cwd: tempDir }, 1800);

  try {
    const pids = await waitForJson(pidFile, 1200);
    assert.ok(pids.parent > 0 && pids.child > 0, 'Fixture must publish parent and descendant PIDs');
    await assert.rejects(command, /Quá thời gian thực thi cho phép/,
      'Timeout must settle with the configured timeout error');

    const heartbeatAfterKill = fs.existsSync(heartbeatFile) ? fs.readFileSync(heartbeatFile, 'utf8') : '';
    await delay(200);
    const heartbeatAfterWait = fs.existsSync(heartbeatFile) ? fs.readFileSync(heartbeatFile, 'utf8') : '';
    assert.strictEqual(heartbeatAfterWait, heartbeatAfterKill,
      'A descendant must stop writing immediately after process-tree termination');

    assert.ok(await waitForProcessesToExit([pids.parent, pids.child], 3000),
      'The command and its descendant must both exit after a timeout');
    console.log('✅ Process-tree timeout regression: group/tree terminated, Promise settled, descendant stopped');
    return { passed: 4, failed: 0, total: 4 };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runProcessTreeTests().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runProcessTreeTests };
