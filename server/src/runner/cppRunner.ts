import { execFile, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { normalizeTrace, NormalizedExecutionPoint } from '../normalizer/dsaNormalizer.js';
import { RawTraceFileSchema } from '../normalizer/schema.js';

export interface RunResult {
  success: boolean;
  buildOutput?: string;
  trace: NormalizedExecutionPoint[];
  finalStdout?: string;
  totalSteps?: number;
  terminationStatus?: string;
  terminationReason?: string;
  debugDiagnostics?: string;
  error?: string;
}

const FORBIDDEN_PATTERNS = [
  /#include\s*<windows\.h>/i,
  /#include\s*<winsock2\.h>/i,
  /#include\s*<process\.h>/i,
  /#include\s*<sys\/socket\.h>/i,
  /#include\s*<sys\/types\.h>/i,
  /\bsystem\s*\(/i,
  /\bpopen\s*\(/i,
  /\bfork\s*\(/i,
  /\bexec[lv][pe]?\s*\(/i,
  /\bCreateProcess/i,
  /\bShellExecute/i
];

// Local execution concurrency guard: prevent host resource starvation
let activeExecutions = 0;
const MAX_CONCURRENT_EXECUTIONS = 8;

const closedChildProcesses = new WeakSet<ChildProcess>();

function waitForChildClose(child: ChildProcess | undefined, timeoutMs: number): Promise<boolean> {
  if (!child || closedChildProcesses.has(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let finished = false;
    let timer: NodeJS.Timeout;
    const finish = (closed: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(closed);
    };
    const onClose = () => {
      closedChildProcesses.add(child);
      finish(true);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
    if (closedChildProcesses.has(child)) finish(true);
  });
}

class ProcessTreeTerminationError extends Error {
  readonly processTreeTerminationVerified = false;
  readonly rootPid: number;

  constructor(rootPid: number, reason: string) {
    super(`Không xác minh được việc dừng toàn bộ cây tiến trình ${rootPid}: ${reason}`);
    this.name = 'ProcessTreeTerminationError';
    this.rootPid = rootPid;
  }
}

type WindowsProcessIdentity = {
  pid: number;
  parentPid: number;
  depth: number;
  creation: string;
};

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runPowerShell(script: string, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, stdout = '', stderr = '') => {
      if (settled) return;
      settled = true;
      if (error) {
        const details = [stderr, stdout].filter(Boolean).join(' ').trim() || `exit=${(error as any).code ?? (error as any).signal ?? 'unknown'}`;
        reject(new Error(`Windows process-tree helper failed: ${details}`));
      }
      else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    };
    const helperExecutable = env?.FLOWLAB_POWERSHELL_EXE || process.env.FLOWLAB_POWERSHELL_EXE || 'powershell.exe';
    const child = execFile(helperExecutable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', encodePowerShell(script)
    ], { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024, ...(env ? { env } : {}) }, (error, stdout, stderr) => {
      finish(error, stdout, stderr);
    });
    // execFile's callback fires after the child closes and includes all captured
    // stderr/stdout. Settling from the earlier 'error' event loses the useful
    // PowerShell diagnostic (and can race the callback on timeout/spawn errors).
  });
}

const PROCESS_TREE_SNAPSHOT_SCRIPT = (rootPid: number) => `
$ErrorActionPreference = 'Stop'
$root = ${rootPid}
$all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$queue = New-Object 'System.Collections.Generic.Queue[object]'
$queue.Enqueue(@{ pid = $root; depth = -1 })
$seen = @{}
$found = New-Object 'System.Collections.Generic.List[object]'
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  $parentKey = [string]$parent.pid
  if ($seen.ContainsKey($parentKey)) { continue }
  $seen[$parentKey] = $true
  foreach ($proc in $all) {
    if ([int]$proc.ParentProcessId -ne [int]$parent.pid) { continue }
    $pidValue = [int]$proc.ProcessId
    $key = [string]$pidValue
    if ($seen.ContainsKey($key)) { continue }
    $created = ''
    if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
    $item = @{ pid = $pidValue; parentPid = [int]$proc.ParentProcessId; depth = [int]$parent.depth + 1; creation = $created }
    $found.Add($item)
    $queue.Enqueue(@{ pid = $pidValue; depth = $item.depth })
  }
}
$rootProc = $all | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1
if ($rootProc) {
  $created = ''
  if ($rootProc.CreationDate) { $created = $rootProc.CreationDate.ToUniversalTime().ToString('o') }
  $found.Insert(0, @{ pid = $root; parentPid = [int]$rootProc.ParentProcessId; depth = 0; creation = $created })
}
ConvertTo-Json -InputObject @($found.ToArray()) -Compress -Depth 5
`;

function parseWindowsIdentities(stdout: string): WindowsProcessIdentity[] {
  if (!stdout) return [];
  const parsed = JSON.parse(stdout);
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.filter((item: any) => Number.isInteger(Number(item.pid))).map((item: any) => ({
    pid: Number(item.pid),
    parentPid: Number(item.parentPid || 0),
    depth: Number(item.depth || 0),
    creation: String(item.creation || '')
  }));
}

async function snapshotWindowsProcessTree(pid: number, env?: NodeJS.ProcessEnv): Promise<WindowsProcessIdentity[]> {
  const { stdout } = await runPowerShell(PROCESS_TREE_SNAPSHOT_SCRIPT(pid), 3500, env);
  return parseWindowsIdentities(stdout);
}

function windowsTreeActionScript(pid: number, identities: WindowsProcessIdentity[], waitForExit: boolean): string {
  const identityJson = JSON.stringify(identities).replace(/'/g, "''");
  const waitScript = waitForExit ? 'Start-Sleep -Milliseconds 120' : '';
  const maxPasses = waitForExit ? 1 : 18;
  return `
$ErrorActionPreference = 'Stop'
$root = ${pid}
$seedJson = ConvertFrom-Json -InputObject '${identityJson}'
$seed = New-Object 'System.Collections.Generic.List[object]'
foreach ($entry in $seedJson) { $seed.Add($entry) }
function Get-CurrentTree {
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $queue = New-Object 'System.Collections.Generic.Queue[object]'
  $queue.Enqueue(@{ pid = $root; depth = -1 })
  $seen = @{}
  $found = New-Object 'System.Collections.Generic.List[object]'
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    $parentKey = [string]$parent.pid
    if ($seen.ContainsKey($parentKey)) { continue }
    $seen[$parentKey] = $true
    foreach ($proc in $all) {
      if ([int]$proc.ParentProcessId -ne [int]$parent.pid) { continue }
      $pidValue = [int]$proc.ProcessId
      if ($seen.ContainsKey([string]$pidValue)) { continue }
      $created = ''
      if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
      $item = @{ pid = $pidValue; parentPid = [int]$proc.ParentProcessId; depth = [int]$parent.depth + 1; creation = $created }
      $found.Add($item)
      $queue.Enqueue(@{ pid = $pidValue; depth = $item.depth })
    }
  }
  return @($found.ToArray())
}
function Get-LiveSeed {
  $live = New-Object 'System.Collections.Generic.List[object]'
  foreach ($expected in $seed) {
    $filter = 'ProcessId = ' + [string]($expected.pid)
    $proc = Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop | Select-Object -First 1
    if (-not $proc) { continue }
    $created = ''
    if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
    if ([string]$expected.creation -eq $created) { $live.Add($expected) }
  }
  return @($live.ToArray())
}
for ($pass = 0; $pass -lt ${maxPasses}; $pass++) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $tree = @(Get-CurrentTree)
  $targets = @($tree + (Get-LiveSeed) | Sort-Object pid -Unique)
  foreach ($target in ($targets | Sort-Object depth -Descending)) {
    $filter = 'ProcessId = ' + [string]($target.pid)
    $proc = Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop | Select-Object -First 1
    if (-not $proc) { continue }
    $created = ''
    if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
    if ($target.creation -and $target.creation -ne $created) { continue }
    Stop-Process -Id ([int]($target.pid)) -Force -ErrorAction SilentlyContinue
  }
  ${waitScript}
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $tree = @(Get-CurrentTree)
  $seedLive = @(Get-LiveSeed)
  if ($tree.Count -eq 0 -and $seedLive.Count -eq 0) {
    Write-Output '{"verified":true,"remaining":[]}'
    exit 0
  }
}
$all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$tree = @(Get-CurrentTree)
$seedLive = @(Get-LiveSeed)
$remaining = @($tree + $seedLive | Sort-Object pid -Unique)
Write-Output (ConvertTo-Json -InputObject @{ verified = $false; remaining = $remaining } -Compress -Depth 5)
exit 3
`;
}

async function taskkillWindowsTree(pid: number, env?: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const killer = execFile('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 3000,
      maxBuffer: 256 * 1024,
      ...(env ? { env } : {})
    }, error => finish(error));
    killer.once('error', error => finish(error));
  });
}

function windowsTreeVerificationScript(pid: number, identities: WindowsProcessIdentity[]): string {
  const identityJson = JSON.stringify(identities).replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
$root = ${pid}
$seedJson = ConvertFrom-Json -InputObject '${identityJson}'
$seed = New-Object 'System.Collections.Generic.List[object]'
foreach ($entry in $seedJson) { $seed.Add($entry) }
$all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$queue = New-Object 'System.Collections.Generic.Queue[object]'
$queue.Enqueue(@{ pid = $root; depth = -1 })
$seen = @{}
$tree = New-Object 'System.Collections.Generic.List[object]'
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  $parentKey = [string]$parent.pid
  if ($seen.ContainsKey($parentKey)) { continue }
  $seen[$parentKey] = $true
  foreach ($proc in $all) {
    if ([int]$proc.ParentProcessId -ne [int]$parent.pid) { continue }
    $pidValue = [int]$proc.ProcessId
    if ($seen.ContainsKey([string]$pidValue)) { continue }
    $created = ''
    if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
    $tree.Add(@{ pid = $pidValue; parentPid = [int]$proc.ParentProcessId; depth = [int]$parent.depth + 1; creation = $created })
    $queue.Enqueue(@{ pid = $pidValue; depth = [int]$parent.depth + 1 })
  }
}
$remaining = New-Object 'System.Collections.Generic.List[object]'
foreach ($expected in $seed) {
  $filter = 'ProcessId = ' + [string]($expected.pid)
  $proc = Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop | Select-Object -First 1
  if (-not $proc) { continue }
  $created = ''
  if ($proc.CreationDate) { $created = $proc.CreationDate.ToUniversalTime().ToString('o') }
  if ([string]$expected.creation -eq $created) { $remaining.Add($expected) }
}
if ($tree.Count -eq 0 -and $remaining.Count -eq 0) { Write-Output '{"verified":true}'; exit 0 }
Write-Output (ConvertTo-Json -InputObject @{ verified = $false; descendants = @($tree.ToArray()); captured = @($remaining.ToArray()) } -Compress -Depth 5)
exit 3
`;
}

async function verifyWindowsTreeGone(pid: number, identities: WindowsProcessIdentity[], timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      await runPowerShell(windowsTreeVerificationScript(pid, identities), 2500, env);
      return true;
    } catch {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } while (Date.now() < deadline);
  return false;
}

async function fallbackTerminateWindowsTree(pid: number, identities: WindowsProcessIdentity[], env?: NodeJS.ProcessEnv): Promise<{ verified: boolean; reason?: string }> {
  try {
    await runPowerShell(windowsTreeActionScript(pid, identities, false), 6500, env);
    return { verified: true };
  } catch (error: any) {
    // Exit code 3 means at least one captured/current process survived. Preserve
    // the helper's actual diagnostic so unverified shutdown is actionable.
    return { verified: false, reason: error?.message || String(error) };
  }
}

async function terminateWindowsProcessTree(pid: number, env?: NodeJS.ProcessEnv): Promise<void> {
  let identities: WindowsProcessIdentity[] = [];
  let snapshotError = '';
  try {
    identities = await snapshotWindowsProcessTree(pid, env);
  } catch (error: any) {
    snapshotError = error?.message || String(error);
  }

  let taskkillError = '';
  try {
    await taskkillWindowsTree(pid, env);
  } catch (error: any) {
    taskkillError = error?.message || String(error);
  }

  if (!snapshotError && identities.length > 0 && !taskkillError
      && await verifyWindowsTreeGone(pid, identities, 1800, env)) {
    return;
  }

  const fallback = await fallbackTerminateWindowsTree(pid, identities, env);
  if (fallback.verified && identities.length > 0
      && await verifyWindowsTreeGone(pid, identities, 1200, env)) {
    return;
  }

  const reasons = [
    taskkillError ? `taskkill failed: ${taskkillError}` : '',
    snapshotError ? `process snapshot failed: ${snapshotError}` : '',
    identities.length === 0 ? 'no descendant ownership snapshot was available' : '',
    fallback.verified ? 'fallback could not confirm all captured processes exited' : `PowerShell fallback failed or timed out: ${fallback.reason || 'no diagnostic'}`
  ].filter(Boolean).join('; ');
  throw new ProcessTreeTerminationError(pid, reasons || 'process-tree exit verification failed');
}

function terminateProcessTree(pid: number, rootProcess?: ChildProcess, env?: NodeJS.ProcessEnv): Promise<void> {
  if (process.platform === 'win32') {
    return terminateWindowsProcessTree(pid, env).catch(error => {
      // Best-effort root kill is not treated as descendant verification.
      try { if (rootProcess && rootProcess.exitCode === null && rootProcess.signalCode === null) rootProcess.kill('SIGKILL'); } catch { /* Root may have exited. */ }
      throw error;
    });
  }

  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // The command may have exited between the group and process signals.
      }
    }
  };

  return new Promise((resolve) => {
    signalGroup('SIGTERM');
    setTimeout(() => {
      signalGroup('SIGKILL');
      const deadline = Date.now() + 1200;
      const waitForGroupExit = () => {
        try {
          process.kill(-pid, 0);
        } catch (error: any) {
          if (error?.code === 'ESRCH') {
            resolve();
            return;
          }
        }
        if (Date.now() >= deadline) {
          resolve();
          return;
        }
        setTimeout(waitForGroupExit, 25);
      };
      waitForGroupExit();
    }, 100);
  });
}

type StartCommand = () => ChildProcess;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

function runCommandWithTimeout(start: StartCommand, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = null;
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    let settled = false;
    let termination: Promise<void> | null = null;
    let capturedStdout = '';
    let capturedStderr = '';

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        if ((error as any).processTreeTerminationVerified === false) {
          (error as any).stdout = capturedStdout;
          (error as any).stderr = capturedStderr;
          reject(error);
          return;
        }
        const preserveReason = timedOut || error.message.includes('maxBuffer');
        const errObj: any = new Error(preserveReason ? error.message : (capturedStderr || capturedStdout || error.message));
        errObj.stdout = capturedStdout;
        errObj.stderr = capturedStderr;
        reject(errObj);
      } else {
        resolve({ stdout: capturedStdout, stderr: capturedStderr });
      }
    };

    const stopAndFinish = (error: Error, isTimeout = false) => {
      if (settled || termination) return;
      timedOut = isTimeout;
      termination = child?.pid ? terminateProcessTree(child.pid, child, env) : Promise.resolve();
      void termination.then(
        () => finish(error),
        (terminationError) => finish(terminationError instanceof Error ? terminationError : error)
      );
    };

    const capture = (stream: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const current = stream === 'stdout' ? capturedStdout : capturedStderr;
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, MAX_COMMAND_OUTPUT_BYTES - Buffer.byteLength(current));
      const accepted = input.subarray(0, remaining).toString('utf8');
      if (stream === 'stdout') capturedStdout += accepted;
      else capturedStderr += accepted;
      if (input.length > remaining) {
        stopAndFinish(new Error(stream + ' maxBuffer length exceeded'));
      }
    };

    try {
      child = start();
      child.stdout?.on('data', (chunk: Buffer | string) => capture('stdout', chunk));
      child.stderr?.on('data', (chunk: Buffer | string) => capture('stderr', chunk));
      child.once('error', (error) => {
        if (!termination) finish(error);
      });
      child.once('close', (code, signal) => {
        closedChildProcesses.add(child!);
        if (settled || termination) return;
        if (code === 0 && signal === null) finish();
        else finish(new Error(signal ? 'Command terminated by signal ' + signal : 'Command failed with exit code ' + code));
      });

      timer = setTimeout(() => {
        if (settled || termination) return;
        stopAndFinish(new Error('Quá thời gian thực thi cho phép (' + timeoutMs / 1000 + 's)'), true);
      }, timeoutMs);
    } catch (error: any) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function execWithTimeout(
  command: string,
  options: { cwd: string; env?: NodeJS.ProcessEnv },
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return runCommandWithTimeout(
    () => spawn(command, {
      ...options,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }),
    timeoutMs,
    options.env
  );
}

/** Exported for regression tests that verify descendant termination on both platforms. */
export function execFileWithTimeout(
  file: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return runCommandWithTimeout(
    () => spawn(file, args, {
      ...options,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }),
    timeoutMs,
    options.env
  );
}

export async function runCppCode(code: string, stdinText: string = ''): Promise<RunResult> {
  // 1. Concurrency control
  if (activeExecutions >= MAX_CONCURRENT_EXECUTIONS) {
    return {
      success: false,
      buildOutput: 'Máy chủ đang bận xử lý các tác vụ thực thi khác. Vui lòng chờ vài giây và thử lại.',
      trace: []
    };
  }

  // 2. Input size limits
  if (code.length > 50000) {
    return {
      success: false,
      buildOutput: 'Lỗi kích thước: Mã nguồn vượt quá giới hạn 50,000 ký tự cho phép.',
      trace: []
    };
  }

  if (stdinText.length > 20000) {
    return {
      success: false,
      buildOutput: 'Lỗi kích thước: Dữ liệu stdin vượt quá giới hạn 20,000 ký tự cho phép.',
      trace: []
    };
  }

  // 3. Static Forbidden Pattern Checks (Supplementary defense, NOT a full sandbox)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return {
        success: false,
        buildOutput: 'Bảo mật: Mã nguồn chứa các hàm hệ thống hoặc thư viện bị cấm vì lý do an toàn môi trường.',
        trace: []
      };
    }
  }

  activeExecutions++;
  let releaseExecutionSlot = true;
  let retainWorkspace = false;
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const tempDir = path.join(homeDir, '.dsa_flowlab_tmp', runId);

  try {
    // 4. Setup ephemeral workspace in user home (.dsa_flowlab_tmp)
    fs.mkdirSync(tempDir, { recursive: true });

    const sourceFile = path.join(tempDir, 'source.cpp');
    const isWin = process.platform === 'win32';
    const exeFile = path.join(tempDir, isWin ? 'flowlab_runner.exe' : 'flowlab_runner');
    const stdinFile = path.join(tempDir, 'stdin.txt');
    const stdoutFile = path.join(tempDir, 'stdout.txt');
    const traceFile = path.join(tempDir, 'trace.json');
    const localTracerPy = path.join(tempDir, 'tracer.py');

    const candidatePaths = [
      path.resolve(__dirname, 'tracer.py'),
      path.resolve(__dirname, '..', '..', 'src', 'runner', 'tracer.py'),
      path.resolve(process.cwd(), 'server', 'src', 'runner', 'tracer.py'),
      path.resolve(process.cwd(), 'src', 'runner', 'tracer.py'),
    ];
    let tracerPySource = candidatePaths.find(p => fs.existsSync(p));
    if (!tracerPySource) {
      throw new Error('Không tìm thấy tệp tracer.py');
    }
    fs.copyFileSync(tracerPySource, localTracerPy);

    fs.writeFileSync(sourceFile, code, 'utf-8');
    fs.writeFileSync(stdinFile, stdinText || '', 'utf-8');
    fs.writeFileSync(stdoutFile, '', 'utf-8');
    // 5. Compile with g++
    // -mconsole is a MinGW/Windows-specific flag that must not be used on Linux.
    // On Linux/macOS we compile to a plain ELF binary.
    const outputBinary = isWin ? 'flowlab_runner.exe' : 'flowlab_runner';
    const platformFlags = isWin ? '-mconsole' : '';
    const compileCmd = `g++ -std=c++11 -g3 -O0 ${platformFlags} -fno-omit-frame-pointer -fasynchronous-unwind-tables source.cpp -o ${outputBinary}`.trim().replace(/  +/g, ' ');
    try {
      await execWithTimeout(compileCmd, { cwd: tempDir }, 25000);
    } catch (compileErr: any) {
      if (compileErr?.processTreeTerminationVerified === false) {
        releaseExecutionSlot = false;
        retainWorkspace = true;
      }
      const errOut = compileErr.stderr || compileErr.stdout || compileErr.message;
      return {
        success: false,
        buildOutput: errOut,
        trace: [],
        ...(compileErr?.processTreeTerminationVerified === false ? { terminationStatus: 'interrupted', terminationReason: compileErr.message } : {})
      };
    }

    // 6. Run GDB with Python Tracer
    if (isWin) {
      // Brief yield on Windows to let filesystem and file scanners release handle on fresh binary
      await new Promise(r => setTimeout(r, 120));
    }
    const env = {
      ...process.env,
      FLOWLAB_TARGET_FILE: 'source.cpp',
      // The debugger's Python host ABI is not necessarily the executable's ABI
      // (notably for MinGW GDB on Windows), so pass the compiler target directly.
      FLOWLAB_TARGET_ABI: isWin ? 'windows-x64' : 'sysv-x64',
      FLOWLAB_STDIN_FILE: stdinFile,
      FLOWLAB_STDOUT_FILE: stdoutFile,
      FLOWLAB_TRACE_FILE: traceFile,
      FLOWLAB_DEALLOC_DEBUG_FILE: path.join(tempDir, 'deallocation-debug.jsonl'),
      FLOWLAB_MAX_STEPS: process.env.FLOWLAB_MAX_STEPS || '1000'
    };

    const gdbCmd = `gdb -batch -q -x tracer.py ${outputBinary}`;
    const configuredGdbTimeout = Number.parseInt(process.env.FLOWLAB_GDB_TIMEOUT_MS || '', 10);
    const gdbTimeoutMs = Number.isFinite(configuredGdbTimeout) && configuredGdbTimeout > 0
      ? Math.min(configuredGdbTimeout, 35000)
      : 35000;
    let gdbExecutionError = '';
    try {
      await execWithTimeout(gdbCmd, { env, cwd: tempDir }, gdbTimeoutMs);
    } catch (gdbErr: any) {
      // Do not parse a partial trace or clean resources if descendant exit is unverified.
      gdbExecutionError = gdbErr?.message || String(gdbErr);
      if (gdbErr?.processTreeTerminationVerified === false) {
        releaseExecutionSlot = false;
        retainWorkspace = true;
        return { success: false, buildOutput: gdbExecutionError, trace: [], terminationStatus: 'interrupted', terminationReason: gdbExecutionError };
      }
    }

    // 7. Read trace.json
    if (!fs.existsSync(traceFile)) {
      return {
        success: false,
        buildOutput: `Lỗi thực thi: Không thể tạo vết thực thi (Execution Trace). ${gdbExecutionError || 'Có thể chương trình gặp lỗi bộ nhớ nghiêm trọng (Segmentation Fault) hoặc quá thời gian xử lý.'}`,
        trace: [],
        terminationStatus: gdbExecutionError.includes('Quá thời gian') ? 'timeout' : 'interrupted',
        terminationReason: gdbExecutionError || 'GDB không tạo được vết thực thi.'
      };
    }

    let traceRaw: any;
    try {
      traceRaw = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
    } catch (parseErr: any) {
      return {
        success: false,
        buildOutput: `Lỗi định dạng tệp vết thực thi (JSON Parse Error): ${parseErr.message}`,
        trace: []
      };
    }

    // Strict Schema Validation: Malformed trace files result in explicit validation errors
    const validationResult = RawTraceFileSchema.safeParse(traceRaw);
    if (!validationResult.success) {
      return {
        success: false,
        buildOutput: `Lỗi xác thực cấu trúc vết thực thi (Schema Validation Error): ${validationResult.error.message}`,
        trace: []
      };
    }

    const validatedTrace = validationResult.data;
    const rawPoints = validatedTrace.trace || [];

    if (rawPoints.length === 0) {
      let extra = '';
      const runLog = path.join(tempDir, 'gdb_run_error.log');
      if (fs.existsSync(runLog)) extra += fs.readFileSync(runLog, 'utf-8');
      return {
        success: false,
        buildOutput: `Vết thực thi rỗng: ${extra || 'Không thể bắt đầu tại hàm main'}`,
        trace: []
      };
    }

    // 8. Normalize trace for DSA Visualization
    const normalizedPoints = normalizeTrace(rawPoints);
    const debugDiagnostics = process.env.FLOWLAB_DEBUG_DEALLOC === '1'
      ? (fs.existsSync(env.FLOWLAB_DEALLOC_DEBUG_FILE)
        ? fs.readFileSync(env.FLOWLAB_DEALLOC_DEBUG_FILE, 'utf-8')
        : '')
      : undefined;

    return {
      success: true,
      trace: normalizedPoints,
      finalStdout: validatedTrace.final_stdout,
      totalSteps: normalizedPoints.length,
      terminationStatus: validatedTrace.termination_status || 'normal',
      terminationReason: validatedTrace.termination_reason || '',
      ...(debugDiagnostics === undefined ? {} : { debugDiagnostics })
    };
  } catch (err: any) {
    if (err?.processTreeTerminationVerified === false) {
      releaseExecutionSlot = false;
      retainWorkspace = true;
    }
    return {
      success: false,
      buildOutput: `Lỗi hệ thống: ${err.message}`,
      trace: []
    };
  } finally {
    if (releaseExecutionSlot) activeExecutions = Math.max(0, activeExecutions - 1);
    if (!retainWorkspace) {
      await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    }
  }
}
