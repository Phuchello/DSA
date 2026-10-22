const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { execFileWithTimeout, prewarmWindowsProcessTreeVerifier } = require('../server/dist/runner/cppRunner.js');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${file}`);
}

async function waitForContentChange(file, previous, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current.length > previous.length) return current;
    await delay(10);
  }
  throw new Error(`Timed out waiting for heartbeat change in ${file}`);
}

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
  // Keep one-time native helper compilation outside the measured shutdown budget.
  await prewarmWindowsProcessTreeVerifier();
  if (process.platform === 'win32') console.log('✅ Windows process-tree verifier warmed before lifecycle timing assertions');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlab-process-tree-'));
  let passed = 0;
  const total = process.platform === 'win32' ? 13 : 4;
  try {
    const baseline = await startAndTimeOut(tempDir, process.env);
    const startedAt = Date.now();
    await assert.rejects(baseline.command, error => {
      if (!/Quá thời gian thực thi cho phép/.test(error.message)) console.error(`Unexpected process-tree termination: ${error.message}`);
      return /Quá thời gian thực thi cho phép/.test(error.message);
    }, 'Timeout must settle with the configured timeout error');
    assert.ok(Date.now() - startedAt < 15000, 'Timeout termination must settle within the helper’s 12s hard bound plus process-close overhead');
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
      if (passed !== total) throw new Error(`Process-tree assertion accounting mismatch: ${passed}/${total}`);
      return { passed, failed: 0, total };
    }

    const toolsDir = path.join(tempDir, 'failing-tools');
    fs.mkdirSync(toolsDir);
    const failingTaskkill = path.join(toolsDir, 'taskkill.exe');
    compileFailureTool(failingTaskkill);
    const fallbackMarker = path.join(tempDir, 'taskkill-primary-failed.log');
    const fallbackEnv = {
      ...process.env,
      FLOWLAB_TASKKILL_EXE: failingTaskkill,
      FLOWLAB_TOOL_FAILURE_MARKER: fallbackMarker,
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
    'The injected taskkill executable must fail and the native identity fallback must preserve the timeout result');
    passed++;
    assert.ok(fs.existsSync(fallbackMarker), 'The injected primary taskkill executable must actually run and fail');
    passed++;
    assert.ok(await waitForProcessesToExit([fallbackRun.pids.parent, fallbackRun.pids.child], 2000),
      'The system taskkill fallback must terminate parent and descendant');
    passed++;
    await assertHeartbeatStops(fallbackRun.heartbeatFile);
    passed++;
    console.log('✅ Windows failing taskkill: native identity fallback terminated captured tree and heartbeat stopped');

    async function runDelayedVerifierScenario(label, delayEnvironment, markerPath) {
      const scenarioDirectory = path.join(tempDir, label);
      fs.mkdirSync(scenarioDirectory);
      const timingFile = path.join(scenarioDirectory, 'lifecycle-timings.log');
      const delayedEnv = {
        ...process.env,
        ...delayEnvironment,
        FLOWLAB_TEST_LIFECYCLE_TIMING_FILE: timingFile,
      };
      const run = await startAndTimeOut(scenarioDirectory, delayedEnv);
      const startedAt = Date.now();
      await assert.rejects(run.command, error => /Quá thời gian thực thi cho phép/.test(error.message),
        `${label} must still report a verified timeout after the delayed legacy helper completes`);
      assert.ok(Date.now() - startedAt < 15000, `${label} must respect the existing bounded helper deadline`);
      await waitForFile(markerPath, 2000);
      assert.ok(await waitForProcessesToExit([run.pids.parent, run.pids.child], 1500),
        `${label} must verify the target and descendant are gone after the injected delay`);
      await assertHeartbeatStops(run.heartbeatFile);
      const timings = fs.readFileSync(timingFile, 'utf8').trim().split(/\r?\n/)
        .map(line => line.split('|'))
        .reduce((result, [phase, time]) => ({ ...result, [phase]: Date.parse(time) }), {});
      assert.ok(Number.isFinite(timings['helper-start']) && Number.isFinite(timings['helper-start-delay-complete']),
        `${label} must capture helper startup phase timestamps`);
      assert.ok(Number.isFinite(timings['initial-snapshot-start']) && Number.isFinite(timings['initial-snapshot-complete']),
        `${label} must capture native snapshot phase timestamps`);
      if (label === 'delayed-helper-startup') {
        assert.ok(timings['helper-start-delay-complete'] - timings['helper-start'] >= 400,
          'Artificial PowerShell startup delay must be measured in phase timestamps');
      } else {
        assert.ok(timings['initial-snapshot-complete'] - timings['initial-snapshot-start'] >= 100,
          'Artificial Toolhelp snapshot delay must be measured in phase timestamps');
      }
      const phaseMs = {
        helperStartup: timings['helper-start-delay-complete'] - timings['helper-start'],
        initialSnapshot: timings['initial-snapshot-complete'] - timings['initial-snapshot-start'],
        primaryKill: timings['primary-kill-complete'] - timings['primary-kill-start'],
        verification: timings['verification-complete'] - timings['verification-start'],
      };
      console.log(`✅ Windows legacy Toolhelp ${label}: elapsed phases=${JSON.stringify(phaseMs)}ms; marker observed; timeout bounded; fixture PIDs and heartbeat stopped.`);
      passed++;
    }

    const helperStartMarker = path.join(tempDir, 'helper-start-delay-reached.log');
    await runDelayedVerifierScenario('delayed-helper-startup', {
      FLOWLAB_TEST_HELPER_START_DELAY_MS: '450',
      FLOWLAB_TEST_HELPER_START_DELAY_MARKER: helperStartMarker,
    }, helperStartMarker);

    const snapshotDelayMarker = path.join(tempDir, 'snapshot-delay-reached.log');
    await runDelayedVerifierScenario('delayed-snapshot-enumeration', {
      FLOWLAB_TEST_SNAPSHOT_DELAY_MS: '120',
      FLOWLAB_TEST_SNAPSHOT_DELAY_MARKER: snapshotDelayMarker,
    }, snapshotDelayMarker);
    async function runLateChildScenario(label, injectNextError = false) {
      const fixture = path.join(__dirname, 'processTreeChild.js');
      const files = {
        pid: path.join(tempDir, `${label}-parent.json`),
        trigger: path.join(tempDir, `${label}-spawn.trigger`),
        ready: path.join(tempDir, `${label}-child-ready.json`),
        spawned: path.join(tempDir, `${label}-child-spawned.json`),
        heartbeat: path.join(tempDir, `${label}-child-heartbeat.txt`),
        identity: path.join(tempDir, `${label}-child-identity.txt`),
        allowRootKill: path.join(tempDir, `${label}-allow-root-kill`),
        snapshotComplete: path.join(tempDir, `${label}-initial-snapshot-complete`),
        primaryMarker: path.join(tempDir, `${label}-primary-marker.log`),
      };
      const env = {
        ...process.env,
        FLOWLAB_TASKKILL_EXE: failingTaskkill,
        FLOWLAB_TOOL_FAILURE_MARKER: files.primaryMarker,
        FLOWLAB_TEST_LATE_CHILD_TRIGGER_FILE: files.trigger,
        FLOWLAB_TEST_LATE_CHILD_READY_FILE: files.ready,
        FLOWLAB_TEST_LATE_CHILD_IDENTITY_FILE: files.identity,
        FLOWLAB_TEST_ALLOW_ROOT_KILL_FILE: files.allowRootKill,
        FLOWLAB_TEST_SNAPSHOT_COMPLETED_FILE: files.snapshotComplete,
        ...(injectNextError ? { FLOWLAB_TEST_PROCESS32NEXT_FAIL_AFTER_ROOT: '1' } : {}),
      };
      const command = execFileWithTimeout(process.execPath, [
        fixture, 'late-parent', files.pid, files.trigger, files.ready, files.heartbeat, files.spawned
      ], { cwd: tempDir, env }, 1800);
      // The late-child harness deliberately waits for Toolhelp snapshot
      // markers before awaiting the timeout result. Attach a rejection handler
      // immediately so Node cannot treat the expected bounded timeout as an
      // unhandled rejection during that evidence-gathering interval.
      void command.catch(() => {});
      let parent;
      let child;
      let faultInjectionChecks = 0;
      const checkFaultInjection = (condition, message) => {
        assert.ok(condition, message);
        faultInjectionChecks++;
      };
      const equalFaultInjection = (actual, expected, message) => {
        assert.strictEqual(actual, expected, message);
        faultInjectionChecks++;
      };
      try {
        parent = await waitForJson(files.pid, 1200);
        assert.ok(parent.parent > 0, 'Late-child fixture root must publish its PID');
        let terminationError;
        if (injectNextError) {
          const injectionStartedAt = Date.now();
          await assert.rejects(command, error => {
            terminationError = error;
            return error?.processTreeTerminationVerified === false;
          }, 'An injected non-EOF Process32NextW result must fail closed as unverified termination');
          faultInjectionChecks++;

          const diagnostic = terminationError.windowsTreeDiagnostic;
          equalFaultInjection(terminationError.processTreeTerminationVerified, false,
            'The process-tree failure must remain explicitly unverified');
          checkFaultInjection(Boolean(diagnostic),
            'The helper must return structured diagnostics for the failed snapshot');
          equalFaultInjection(diagnostic?.failurePhase, 'snapshot-enumeration',
            'Failure phase must identify initial process snapshot enumeration');
          equalFaultInjection(diagnostic?.testFaultInjectionAttempted, true,
            'The deterministic Process32NextW error-injection branch must be attempted');
          equalFaultInjection(diagnostic?.testFaultInjectionReached, true,
            'The SetLastError P/Invoke must return and reach the simulated FALSE result');
          equalFaultInjection(diagnostic?.testInjectedErrorCode, 5,
            'SetLastError must propagate ERROR_ACCESS_DENIED (5) through P/Invoke');
          equalFaultInjection(diagnostic?.testSnapshotErrorCode, 5,
            'Snapshot enumeration must observe ERROR_ACCESS_DENIED (5)');
          equalFaultInjection(diagnostic?.nativeErrorCode, 5,
            'The raised Win32Exception must preserve NativeErrorCode 5');
          checkFaultInjection(diagnostic?.exceptionTypes?.includes('System.ComponentModel.Win32Exception'),
            'The exception chain must contain the expected Win32Exception');
          checkFaultInjection(!diagnostic?.exceptionTypes?.some(type =>
            /EntryPointNotFoundException|DllNotFoundException/.test(type)),
            'The exception chain must not contain a P/Invoke binding or DLL-loading failure');
          const expectedPowerShellExceptionTypes = new Set([
            'System.Management.Automation.MethodInvocationException',
            'System.Management.Automation.RuntimeException',
            'System.ComponentModel.Win32Exception',
          ]);
          checkFaultInjection(Boolean(diagnostic?.exceptionTypes?.length)
            && diagnostic.exceptionTypes.every(type => expectedPowerShellExceptionTypes.has(type)),
            'The exception chain may contain only known PowerShell wrappers around Win32Exception');
          checkFaultInjection(diagnostic?.exceptionMessages?.some(message =>
            /Process32Next failed during process snapshot/.test(message)),
            'The inner failure text must identify snapshot enumeration');
          checkFaultInjection(/Process32Next failed during process snapshot/.test(terminationError.message),
            'The runner rejection must preserve the snapshot-enumeration failure description');
          checkFaultInjection(!fs.existsSync(files.primaryMarker),
            'Incomplete Toolhelp enumeration must be rejected before invoking primary termination');
          checkFaultInjection(!fs.existsSync(files.ready),
            'The root must not spawn a descendant after an incomplete initial snapshot');
          checkFaultInjection(!fs.existsSync(files.snapshotComplete),
            'The injected enumeration error must occur before the primary helper marker');
          checkFaultInjection(Date.now() - injectionStartedAt < 15000,
            'The injected helper failure and execution Promise must settle within the existing hard bound');
          console.log(`✅ Windows Process32NextW fault injection: ${faultInjectionChecks}/18 pre-cleanup checks PASS; phase=${diagnostic.failurePhase}, nativeErrorCode=${diagnostic.nativeErrorCode}, Win32Exception confirmed, no P/Invoke binding error`);
          return;
        }

        await waitForFile(files.identity, 9000);
        assert.ok(fs.existsSync(files.snapshotComplete),
          'The taskkill fixture must prove the initial process snapshot completed before the child spawn');
        child = await waitForJson(files.ready, 1000);
        const [identityPidText, identityCreation] = fs.readFileSync(files.identity, 'utf8').trim().split(':');
        assert.strictEqual(Number(identityPidText), child.pid, 'Captured process identity must match the late child PID');
        assert.ok(/^[0-9]+$/.test(identityCreation || ''), 'The late child must have a nonzero OS creation-time identity');
        assert.ok(child.pid > 0 && child.nonce, 'Late descendant must publish its PID and unique identity token');
        assert.strictEqual(child.parentPid, parent.parent, 'Late child must be created by the target root after the initial snapshot');

        const initialHeartbeat = fs.existsSync(files.heartbeat) ? fs.readFileSync(files.heartbeat, 'utf8') : '';
        const heartbeatBeforeTermination = await waitForContentChange(files.heartbeat, initialHeartbeat, 1500);
        assert.ok(pidIsAlive(child.pid), 'The same late child process must be alive before root-only termination');
        assert.ok(heartbeatBeforeTermination.includes(`${child.pid}:${child.nonce}`),
          'The late child must continue writing its unique heartbeat before root termination');

        // The injected primary tool has observed the completed snapshot, then
        // waited for the child identity and heartbeat before killing only root.
        fs.writeFileSync(files.allowRootKill, 'kill-root-only');
        await assert.rejects(command, error => {
          terminationError = error;
          return /Quá thời gian thực thi cho phép/.test(error.message)
            || error?.processTreeTerminationVerified === false;
        }, 'Timeout must settle after the root-only primary termination attempt');

        assert.ok(await waitForProcessesToExit([parent.parent], 1500), 'The injected primary tool must terminate only the root process');
        const childStopped = await waitForProcessesToExit([child.pid], 1000);
        let heartbeatAdvancedAfterReturn = false;
        if (!childStopped) {
          const atReturn = fs.existsSync(files.heartbeat) ? fs.readFileSync(files.heartbeat, 'utf8') : '';
          try {
            const afterReturn = await waitForContentChange(files.heartbeat, atReturn, 1000);
            heartbeatAdvancedAfterReturn = afterReturn.includes(`${child.pid}:${child.nonce}`);
          } catch { /* A correctly reported unverified state may race fixture cleanup. */ }
        }
        const unverified = terminationError?.processTreeTerminationVerified === false;
        assert.ok(childStopped || unverified,
          `Late child survived root-only termination but helper did not report unverified cleanup; pid=${child.pid}, creation=${identityCreation}, heartbeatAdvanced=${heartbeatAdvancedAfterReturn}, error=${terminationError?.message}`);
        if (!childStopped) {
          assert.strictEqual(unverified, true, 'A surviving descendant may never accompany a verified timeout result');
          assert.ok(heartbeatAdvancedAfterReturn, 'Unverified state must retain evidence that this exact child is still alive');
        }
        console.log(`✅ Windows late child after initial snapshot: pid=${child.pid}, creation=${identityCreation}; ${childStopped ? 'child terminated' : 'unverified cleanup surfaced'}`);
      } finally {
        const cleanupPids = new Set([parent?.parent, child?.pid].filter(pid => Number.isInteger(pid) && pid > 0));
        for (const marker of [files.ready, files.spawned]) {
          if (!child && fs.existsSync(marker)) {
            try { cleanupPids.add(JSON.parse(fs.readFileSync(marker, 'utf8')).pid); } catch { /* Atomic marker or process not ready yet. */ }
          }
        }
        for (const pid of cleanupPids) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* The fixture may already have exited. */ }
        }
        const cleanupConfirmed = cleanupPids.size > 0
          && await waitForProcessesToExit([...cleanupPids], 2000);
        if (injectNextError) {
          checkFaultInjection(cleanupConfirmed,
            'The injected snapshot-failure fixture root must be gone after explicit cleanup');
          assert.strictEqual(faultInjectionChecks, 19,
            'All 19 focused Process32NextW fault-injection assertions must execute');
          console.log(`✅ Windows Process32NextW fixture cleanup: ${cleanupConfirmed ? 'confirmed' : 'FAILED'}; ${faultInjectionChecks}/19 checks PASS`);
        }
      }
    }

    await runLateChildScenario('late-child-after-snapshot');
    passed++;
    await runLateChildScenario('snapshot-next-error', true);
    passed++;

    const unverifiedEnv = {
      ...process.env,
      FLOWLAB_TASKKILL_EXE: failingTaskkill,
      FLOWLAB_TEST_DISABLE_PROCESS_FALLBACK: '1',
      FLOWLAB_TOOL_FAILURE_MARKER: path.join(tempDir, 'taskkill-unverified-primary-failed.log'),
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
    assert.ok(Date.now() - unverifiedStarted < 15000, 'Unverified shutdown must still settle within the helper’s hard bound plus process-close overhead');
    assert.ok(fs.existsSync(unverifiedEnv.FLOWLAB_TOOL_FAILURE_MARKER), 'The injected primary taskkill executable must run before unverified cleanup is surfaced');
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
    if (passed !== total) throw new Error(`Process-tree assertion accounting mismatch: ${passed}/${total}`);
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

