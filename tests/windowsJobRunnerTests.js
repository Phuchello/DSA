const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { execFileWithJobTimeout } = require('../server/dist/runner/cppRunner.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForJson(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { await delay(20); }
  }
  throw new Error(`Timed out waiting for JSON fixture ${filePath}`);
}

async function waitForStatus(filePath, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (predicate(status)) return status;
    } catch { /* The launcher may be writing its status record. */ }
    await delay(25);
  }
  throw new Error(`Timed out waiting for final Job Object status in ${filePath}`);
}

const POWERSHELL_IDENTITY_PROBE = String.raw`
$ErrorActionPreference = 'Stop'
$native = @'
using System;
using System.Runtime.InteropServices;
public static class FlowLabIdentityProbe {
  [StructLayout(LayoutKind.Sequential)] private struct FILETIME { public uint Low; public uint High; }
  [DllImport("kernel32.dll", SetLastError=true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool GetProcessTimes(IntPtr process, out FILETIME creation, out FILETIME exit, out FILETIME kernel, out FILETIME user);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool CloseHandle(IntPtr handle);
  public static int Inspect(uint pid, long expectedCreation, bool terminate) {
    const uint Query = 0x1000, Synchronize = 0x00100000, Terminate = 0x0001;
    IntPtr process = OpenProcess(Query | Synchronize | (terminate ? Terminate : 0), false, pid);
    if (process == IntPtr.Zero) {
      int error = Marshal.GetLastWin32Error();
      return error == 87 || error == 1168 ? 0 : -1;
    }
    try {
      FILETIME creation, exit, kernel, user;
      if (!GetProcessTimes(process, out creation, out exit, out kernel, out user)) return -1;
      long actual = ((long)creation.High << 32) | creation.Low;
      if (actual != expectedCreation || WaitForSingleObject(process, 0) == 0) return 0;
      if (!terminate) return 1;
      if (!TerminateProcess(process, 137)) return -1;
      return WaitForSingleObject(process, 3000) == 0 ? 2 : -1;
    } finally { CloseHandle(process); }
  }
}
'@
Add-Type -TypeDefinition $native
$identities = ConvertFrom-Json $env:FLOWLAB_IDENTITIES_JSON
$terminate = $env:FLOWLAB_IDENTITIES_TERMINATE -eq '1'
foreach ($identity in $identities) {
  $state = [FlowLabIdentityProbe]::Inspect([uint32]$identity.pid, [long]$identity.creation, $terminate)
  if ($state -lt 0) { throw "Could not inspect exact process identity $($identity.pid)@$($identity.creation)" }
  if ($state -eq 1) { throw "Exact process identity remains alive: $($identity.pid)@$($identity.creation)" }
}
`;

const POWERSHELL_HANDLE_COUNT = String.raw`
$ErrorActionPreference = 'Stop'
$native = @'
using System;
using System.Runtime.InteropServices;
public static class FlowLabHandleProbe {
  [DllImport("kernel32.dll", SetLastError=true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool GetProcessHandleCount(IntPtr process, out uint count);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool CloseHandle(IntPtr handle);
  public static uint Count(uint pid) {
    IntPtr process = OpenProcess(0x1000, false, pid);
    if (process == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try { uint count; if (!GetProcessHandleCount(process, out count)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); return count; }
    finally { CloseHandle(process); }
  }
}
'@
Add-Type -TypeDefinition $native
[Console]::Out.WriteLine([FlowLabHandleProbe]::Count([uint32]$env:FLOWLAB_HANDLE_PROBE_PID))
`;

function inspectWindowsIdentities(identities, terminate = false) {
  if (!identities.length) return;
  const encodedScript = Buffer.from(POWERSHELL_IDENTITY_PROBE, 'utf16le').toString('base64');
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: {
      ...process.env,
      FLOWLAB_IDENTITIES_JSON: JSON.stringify(identities),
      FLOWLAB_IDENTITIES_TERMINATE: terminate ? '1' : '0',
    },
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0,
    `Windows OS identity inspection failed (${result.status}, ${result.signal}): ${result.stdout}\n${result.stderr}`);
}

function windowsHandleCount(pid) {
  const encodedScript = Buffer.from(POWERSHELL_HANDLE_COUNT, 'utf16le').toString('base64');
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, FLOWLAB_HANDLE_PROBE_PID: String(pid) },
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, `Could not inspect Windows handle count: ${result.stderr}`);
  const count = Number.parseInt(result.stdout.trim(), 10);
  assert.ok(Number.isInteger(count) && count > 0, `Invalid Windows handle count output: ${result.stdout}`);
  return count;
}

function stressRounds() {
  const configured = Number.parseInt(process.env.FLOWLAB_WINDOWS_JOB_STRESS_ROUNDS || '2', 10);
  assert.ok(Number.isInteger(configured) && configured >= 1 && configured <= 5,
    'FLOWLAB_WINDOWS_JOB_STRESS_ROUNDS must be between one and five');
  return configured;
}

async function runWindowsJobRunnerTests() {
  if (process.platform !== 'win32') {
    console.log('Windows Job Object stress: skipped on non-Windows host (Windows CI executes this suite).');
    return { passed: 0, failed: 0, total: 0, skipped: true };
  }

  const tempRoot = process.env.FLOWLAB_TEST_TEMP_ROOT || os.tmpdir();
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, 'flowlab-job-object-'));
  const fixtureSource = path.join(__dirname, 'windowsJobChild.cpp');
  const fixture = path.join(tempDir, 'windowsJobChild.exe');
  const fixtureBuild = spawnSync('g++', ['-std=c++17', '-O2', '-municode', fixtureSource, '-o', fixture], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(fixtureBuild.error);
  assert.strictEqual(fixtureBuild.status, 0,
    `Could not build the native Windows Job Object fixture: ${fixtureBuild.stdout}\n${fixtureBuild.stderr}`);
  const trackedIdentities = [];
  let passed = 0;
  const batchSize = 8;
  const rounds = stressRounds();
  const initialHandleCount = windowsHandleCount(process.pid);
  try {
    for (let round = 1; round <= rounds; round++) {
      const executions = Array.from({ length: batchSize }, (_, index) => {
        const label = `round-${round}-case-${index + 1}`;
        const pidFile = path.join(tempDir, `${label}-root.json`);
        const basePath = path.join(tempDir, label);
        const statusPath = path.join(tempDir, `${label}-job-status.json`);
        const command = execFileWithJobTimeout(process.execPath,
          [fixture, 'parent', pidFile, basePath],
          { cwd: tempDir, env: process.env, statusPath }, 1400);
        // Fixture startup can exceed the timeout under CI load. Attach a
        // rejection observer now; Promise.allSettled below still owns and
        // asserts the result, but Node must not treat an expected timeout as
        // an unhandled rejection while the process metadata is being gathered.
        void command.catch(() => {});
        return { label, pidFile, basePath, statusPath, command };
      });

      const fixtures = await Promise.all(executions.map(async execution => {
        const root = await waitForJson(execution.pidFile);
        assert.ok(Number.isInteger(root.pid) && root.pid > 0, `${execution.label} root must publish a PID`);
        for (const child of root.children) {
          assert.ok(Number.isInteger(child.pid) && child.pid > 0, `${execution.label} ${child.handleMode} descendant must publish a PID`);
          await waitForJson(child.metadata);
          const heartbeatStart = Date.now();
          while (Date.now() - heartbeatStart < 2500 && !fs.existsSync(child.heartbeat)) await delay(15);
          assert.ok(fs.existsSync(child.heartbeat), `${execution.label} ${child.handleMode} descendant must write an independent heartbeat`);
        }
        return root;
      }));
      assert.strictEqual(fixtures.length, batchSize, `Round ${round} must include eight real process trees`);

      const startedAt = Date.now();
      const outcomes = await Promise.allSettled(executions.map(execution => execution.command));
      const batchElapsedMs = Date.now() - startedAt;
      assert.ok(batchElapsedMs < 7000, `Eight Job Object timeouts in round ${round} must settle within a bounded interval`);
      for (let index = 0; index < executions.length; index++) {
        const outcome = outcomes[index];
        assert.strictEqual(outcome.status, 'rejected', `${executions[index].label} must reject on timeout`);
        assert.match(outcome.reason.message, /Quá thời gian thực thi cho phép/,
          `${executions[index].label} must retain the timeout reason: ${outcome.reason.message}`);
        assert.notStrictEqual(outcome.reason.processTreeTerminationVerified, false,
          `${executions[index].label} must not report an unverified timeout as successful cleanup`);
        const status = await waitForStatus(executions[index].statusPath,
          value => value.phase === 'job-terminated' && value.activeProcesses === 0);
        assert.strictEqual(status.verified, true, `${executions[index].label} Job Object must verify zero active members`);
        assert.strictEqual(status.timedOut, true, `${executions[index].label} status must distinguish timeout`);
        const expectedPids = [fixtures[index].pid, ...fixtures[index].children.map(child => child.pid)].sort((a, b) => a - b);
        const actual = status.processes || [];
        for (const pid of expectedPids) {
          const identity = actual.find(item => item.pid === pid);
          assert.ok(identity, `${executions[index].label} must record OS creation identity for descendant PID ${pid}`);
          assert.match(identity.creation, /^[0-9]+$/, 'Job membership snapshot must preserve process creation time');
          trackedIdentities.push(identity);
        }
        for (const child of fixtures[index].children) {
          const before = fs.readFileSync(child.heartbeat, 'utf8');
          await delay(120);
          const after = fs.readFileSync(child.heartbeat, 'utf8');
          assert.strictEqual(after, before, `${executions[index].label} ${child.handleMode} heartbeat must stop before verified cleanup returns`);
        }
      }
      inspectWindowsIdentities(trackedIdentities);
      passed += batchSize * 7 + 1;
      console.log(`✅ Windows Job Object round ${round}/${rounds}: ${batchElapsedMs}ms; eight roots and sixteen descendants terminated; inherited/non-inherited stdio, OS identities, heartbeats, and active member counts verified.`);

      const recoveredStatusPath = path.join(tempDir, `round-${round}-recovery-status.json`);
      const recovered = await execFileWithJobTimeout(process.execPath,
        ['-e', 'process.stdout.write("JOB_RECOVERED")'],
        { cwd: tempDir, env: process.env, statusPath: recoveredStatusPath }, 5000);
      assert.strictEqual(recovered.stdout, 'JOB_RECOVERED', 'A successful command must run after each timeout batch');
      const recoveryStatus = await waitForStatus(recoveredStatusPath, value => value.phase === 'completed');
      assert.strictEqual(recoveryStatus.verified, true, 'Normal completion must verify zero Job Object members');
      assert.strictEqual(recoveryStatus.activeProcesses, 0);
      passed++;
    }

    const delayedStatusPath = path.join(tempDir, 'delayed-launch-status.json');
    const delayedEnv = { ...process.env, FLOWLAB_TEST_JOB_LAUNCH_DELAY_MS: '900' };
    const delayed = execFileWithJobTimeout(process.execPath,
      ['-e', 'process.stdout.write("must-not-launch")'],
      { cwd: tempDir, env: delayedEnv, statusPath: delayedStatusPath }, 120);
    await assert.rejects(delayed, error => /Quá thời gian thực thi cho phép/.test(error.message));
    const delayedStatus = await waitForStatus(delayedStatusPath, value => value.phase === 'cancelled-before-launch');
    assert.strictEqual(delayedStatus.verified, true, 'Delayed helper startup must settle as verified cancellation before child launch');
    assert.strictEqual(delayedStatus.activeProcesses, 0);
    assert.deepStrictEqual(delayedStatus.processes, []);
    passed += 3;
    console.log('✅ Windows Job Object delayed launcher startup: request cancelled before target creation and verified with zero members.');

    // Exercise the old Toolhelp helper's outer deadline through the actual
    // GDB path. A deliberately unresponsive supervisor must be reported as
    // unverified, retain its workspace and capacity slot, then close the Job
    // handle so the OS terminates the exact GDB/inferior identities.
    const unverifiedHome = path.join(tempDir, 'unverified-home');
    fs.mkdirSync(unverifiedHome);
    const harness = spawnSync(process.execPath, [path.join(__dirname, 'windowsJobUnverifiedHarness.js'), unverifiedHome], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, USERPROFILE: unverifiedHome },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(harness.error);
    assert.strictEqual(harness.status, 0, `Unverified-lifecycle harness failed: ${harness.stdout}\n${harness.stderr}`);
    const jsonLine = harness.stdout.split(/\r?\n/).find(line => line.startsWith('FLOWLAB_UNVERIFIED_HARNESS='));
    assert.ok(jsonLine, `Unverified-lifecycle harness must return structured evidence: ${harness.stdout}`);
    const harnessResult = JSON.parse(jsonLine.slice('FLOWLAB_UNVERIFIED_HARNESS='.length));
    assert.strictEqual(harnessResult.status, 'interrupted');
    assert.strictEqual(harnessResult.retainedCount, 1);
    assert.strictEqual(harnessResult.saturatedRejected, true);
    assert.strictEqual(harnessResult.sevenSuccessfulExecutions, 7);
    const retainedWorkspace = harnessResult.retainedWorkspace;
    assert.ok(fs.existsSync(retainedWorkspace), 'Workspace must remain available while termination is unverified');
    const gdbStatusFile = fs.readdirSync(retainedWorkspace)
      .map(name => path.join(retainedWorkspace, name))
      .find(file => file.endsWith('.json') && readJsonIfValid(file)?.phase === 'termination-request-ignored-test-seam');
    assert.ok(gdbStatusFile, 'Harness must preserve the GDB Job Object status captured at the unverified deadline');
    const gdbStatus = JSON.parse(fs.readFileSync(gdbStatusFile, 'utf8'));
    assert.strictEqual(gdbStatus.verified, false, 'Expired verifier status must remain unverified');
    assert.ok(gdbStatus.activeProcesses > 0, 'The test seam must prove GDB/inferior members were live when termination was requested');
    assert.ok((gdbStatus.processes || []).some(identity => identity.pid === gdbStatus.rootPid),
      'GDB root process identity must be captured before the supervisor deadline');
    trackedIdentities.push(...(gdbStatus.processes || []));
    inspectWindowsIdentities(gdbStatus.processes || []);
    passed += 8;
    console.log(`✅ Windows Job Object unverified outer deadline: ${harnessResult.elapsedMs}ms; rejected as interrupted; exact members ${gdbStatus.processes.map(item => item.pid).join(',')} confirmed gone; workspace retained; capacity slot retained; seven other slots recovered.`);

    await delay(200);
    const finalHandleCount = windowsHandleCount(process.pid);
    assert.ok(finalHandleCount <= initialHandleCount + 4,
      `Repeated verified Job Object cleanup must not leak Node handles (before=${initialHandleCount}, after=${finalHandleCount})`);
    passed++;
    console.log(`✅ Windows runner handle count remained bounded: ${initialHandleCount} -> ${finalHandleCount} handles.`);

    return { passed, failed: 0, total: passed, rounds, timedOutExecutions: batchSize * rounds };
  } finally {
    try {
      inspectWindowsIdentities(trackedIdentities, true);
    } catch (error) {
      console.error(`Test-only exact-identity cleanup reported: ${error.message}`);
      throw error;
    }
    const nestedStatuses = listFilesRecursive(tempDir).filter(file => file.endsWith('.json'));
    const nestedIdentities = nestedStatuses.flatMap(statusPath => readJsonIfValid(statusPath)?.processes || []);
    inspectWindowsIdentities(nestedIdentities, true);
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

function listFilesRecursive(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(entryPath) : [entryPath];
  });
}

function readJsonIfValid(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

if (require.main === module) {
  runWindowsJobRunnerTests().then(summary => {
    console.log(`Windows Job Object stress assertions: ${summary.passed}/${summary.total}`);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runWindowsJobRunnerTests };
