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

type WindowsTreeHelperDiagnostic = {
  failurePhase?: string | null;
  failureType?: string;
  nativeErrorCode?: number | null;
  testFaultInjectionAttempted?: boolean;
  testFaultInjectionReached?: boolean;
  testInjectedErrorCode?: number;
  testSnapshotErrorCode?: number;
  exceptionTypes?: string[];
  exceptionMessages?: string[];
};

class ProcessTreeTerminationError extends Error {
  readonly processTreeTerminationVerified = false;
  readonly rootPid: number;
  readonly windowsTreeDiagnostic?: WindowsTreeHelperDiagnostic;

  constructor(rootPid: number, reason: string, windowsTreeDiagnostic?: WindowsTreeHelperDiagnostic) {
    super(`Không xác minh được việc dừng toàn bộ cây tiến trình ${rootPid}: ${reason}`);
    this.name = 'ProcessTreeTerminationError';
    this.rootPid = rootPid;
    if (windowsTreeDiagnostic) this.windowsTreeDiagnostic = windowsTreeDiagnostic;
  }
}

type ProcessTreeTerminationResult = { fallbackUsed: boolean; primaryError?: string; primaryExecutable?: string };

type WindowsTreeHelperResult = {
  verified: boolean;
  fallbackUsed: boolean;
  primaryError?: string;
  primaryExecutable: string;
  reason?: string;
  diagnostic?: WindowsTreeHelperDiagnostic;
  remaining?: Array<{ pid: number; creation: string }>;
};

let windowsTreeNativeAssemblyPath: string | null = null;
let windowsTreeNativeAssemblyDirectory: string | null = null;
let windowsTreeNativeAssemblyPromise: Promise<string> | null = null;

function ensureWindowsTreeNativeAssembly(env?: NodeJS.ProcessEnv): Promise<string> {
  if (windowsTreeNativeAssemblyPath) return Promise.resolve(windowsTreeNativeAssemblyPath);
  if (windowsTreeNativeAssemblyPromise) return windowsTreeNativeAssemblyPromise;

  const systemRoot = env?.SystemRoot || env?.SYSTEMROOT || process.env.SystemRoot || process.env.SYSTEMROOT;
  const powershell = systemRoot
    ? path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const systemTaskkill = systemRoot ? path.join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill';
  const helperPath = path.join(__dirname, 'windowsProcessTree.ps1');
  const assemblyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlab-process-tree-'));
  const assemblyPath = path.join(assemblyDirectory, 'FlowLabProcessTreeNative.dll');

  const compile = new Promise<string>((resolve, reject) => {
    execFile(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', helperPath,
      '-RootPid', '0',
      '-TaskkillExecutable', systemTaskkill,
      '-NativeAssemblyPath', assemblyPath,
      '-CompileOnly'
    ], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      ...(env ? { env } : {})
    }, (error, stdout, stderr) => {
      if (error || !fs.existsSync(assemblyPath)) {
        const details = [stderr, stdout, error?.message,
          error ? `code=${(error as any).code ?? 'unknown'} signal=${(error as any).signal ?? 'none'} killed=${Boolean((error as any).killed)}` : 'assembly output was not created']
          .filter(Boolean).join(' ').trim();
        reject(new Error(`Could not initialize Windows process-tree verifier: ${details}`));
        return;
      }
      resolve(assemblyPath);
    });
  });

  windowsTreeNativeAssemblyPromise = compile.then(
    compiledPath => {
      windowsTreeNativeAssemblyPath = compiledPath;
      windowsTreeNativeAssemblyDirectory = assemblyDirectory;
      process.once('exit', () => {
        if (windowsTreeNativeAssemblyDirectory) {
          try { fs.rmSync(windowsTreeNativeAssemblyDirectory, { recursive: true, force: true }); } catch { /* OS cleans temp after process exit if files are still locked. */ }
        }
      });
      return compiledPath;
    },
    error => {
      try { fs.rmSync(assemblyDirectory, { recursive: true, force: true }); } catch { /* Best-effort failed initialization cleanup. */ }
      windowsTreeNativeAssemblyPromise = null;
      throw error;
    }
  );
  return windowsTreeNativeAssemblyPromise;
}

/** Prepare the cached Windows process-tree verifier before an execution can time out. */
export async function prewarmWindowsProcessTreeVerifier(): Promise<void> {
  if (process.platform !== 'win32') return;
  await ensureWindowsTreeNativeAssembly();
}

async function terminateWindowsProcessTree(pid: number, rootProcess: ChildProcess | undefined, env?: NodeJS.ProcessEnv): Promise<ProcessTreeTerminationResult> {
  const systemRoot = env?.SystemRoot || env?.SYSTEMROOT || process.env.SystemRoot || process.env.SYSTEMROOT;
  const systemTaskkill = systemRoot ? path.join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill';
  const primaryTaskkill = env?.FLOWLAB_TASKKILL_EXE || process.env.FLOWLAB_TASKKILL_EXE || systemTaskkill;
  const helperPath = path.join(__dirname, 'windowsProcessTree.ps1');
  const powershell = systemRoot
    ? path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  let nativeAssemblyPath: string;
  try {
    nativeAssemblyPath = await ensureWindowsTreeNativeAssembly(env);
  } catch (error: any) {
    throw new ProcessTreeTerminationError(pid, error?.message || String(error));
  }

  const result = await new Promise<WindowsTreeHelperResult>((resolve, reject) => {
    execFile(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', helperPath,
      '-RootPid', String(pid),
      '-TaskkillExecutable', primaryTaskkill,
      '-NativeAssemblyPath', nativeAssemblyPath,
      ...(env?.FLOWLAB_TEST_DISABLE_PROCESS_FALLBACK === '1' ? ['-DisableFallback'] : [])
    ], {
      windowsHide: true,
      timeout: 12000,
      maxBuffer: 1024 * 1024,
      ...(env ? { env } : {})
    }, (error, stdout, stderr) => {
      let parsed: WindowsTreeHelperResult | null = null;
      try {
        const output = stdout.trim();
        const jsonLine = output.split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'));
        if (jsonLine) parsed = JSON.parse(jsonLine);
      } catch { /* Use the subprocess diagnostic below if the helper emitted invalid JSON. */ }

      if (parsed) {
        if (error && parsed.verified) {
          reject(new ProcessTreeTerminationError(pid, `Windows helper reported success but exited abnormally: ${error.message}`));
          return;
        }
        resolve(parsed);
        return;
      }
      const details = [
        stderr,
        stdout,
        error?.message,
        error ? `code=${(error as any).code ?? 'unknown'} signal=${(error as any).signal ?? 'none'} killed=${Boolean((error as any).killed)}` : ''
      ].filter(Boolean).join(' ').trim() || 'helper produced no result';
      reject(new ProcessTreeTerminationError(pid, `Windows process-tree helper failed: ${details}`));
    });
  });

  if (!result.verified) {
    throw new ProcessTreeTerminationError(pid,
      `${result.reason || 'process-tree shutdown was not verified'}; helper=${powershell}; taskkill=${result.primaryExecutable}; remaining=${JSON.stringify(result.remaining || [])}`,
      result.diagnostic);
  }
  return {
    fallbackUsed: result.fallbackUsed,
    primaryExecutable: result.primaryExecutable,
    ...(result.primaryError ? { primaryError: result.primaryError } : {})
  };
}

/* The Windows helper uses Toolhelp32 process snapshots, not WMI/CIM. It
 * captures process creation identities before termination, invokes taskkill
 * for the primary tree kill, and verifies every captured identity is gone.
 * If taskkill fails or leaves descendants, the helper terminates captured
 * identities individually and keeps taking snapshots until the tree is gone
 * or its bounded deadline expires. */

function terminateProcessTree(pid: number, rootProcess?: ChildProcess, env?: NodeJS.ProcessEnv): Promise<ProcessTreeTerminationResult> {
  if (process.platform === 'win32') {
    return terminateWindowsProcessTree(pid, rootProcess, env).then(async result => {
      if (rootProcess && !await waitForChildClose(rootProcess, 1500)) {
        throw new ProcessTreeTerminationError(pid, 'the verified process tree disappeared but the root close event was not observed');
      }
      return result;
    }).catch(error => {
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

  return new Promise((resolve, reject) => {
    signalGroup('SIGTERM');
    setTimeout(() => {
      signalGroup('SIGKILL');
      const deadline = Date.now() + 1200;
      const waitForGroupExit = () => {
        try {
          process.kill(-pid, 0);
        } catch (error: any) {
          if (error?.code === 'ESRCH') {
            resolve({ fallbackUsed: false });
            return;
          }
        }
        if (Date.now() >= deadline) {
          reject(new ProcessTreeTerminationError(pid, 'POSIX process group remained after SIGKILL deadline'));
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
    let termination: Promise<ProcessTreeTerminationResult> | null = null;
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
        if ((error as any).processTreeFallbackUsed) {
          errObj.processTreeFallbackUsed = true;
          errObj.processTreePrimaryError = (error as any).processTreePrimaryError;
          errObj.processTreePrimaryExecutable = (error as any).processTreePrimaryExecutable;
        }
        reject(errObj);
      } else {
        resolve({ stdout: capturedStdout, stderr: capturedStderr });
      }
    };

    const stopAndFinish = (error: Error, isTimeout = false) => {
      if (settled || termination) return;
      timedOut = isTimeout;
      termination = child?.pid ? terminateProcessTree(child.pid, child, env) : Promise.resolve({ fallbackUsed: false });
      void termination.then(
        outcome => {
          (error as any).processTreePrimaryExecutable = outcome.primaryExecutable;
          if (outcome.fallbackUsed) {
            (error as any).processTreeFallbackUsed = true;
            (error as any).processTreePrimaryError = outcome.primaryError;
          }
          finish(error);
        },
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

