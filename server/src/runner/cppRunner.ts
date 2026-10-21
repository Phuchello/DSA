import { exec, execFile, ChildProcess } from 'child_process';
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

function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(fallback);
        resolve();
      };
      const killRootFallback = () => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // The root command may already have exited.
        }
        finish();
      };
      // taskkill /T terminates the shell, GDB, and the inferior as one tree.
      const fallback = setTimeout(killRootFallback, 1500);
      const killer = execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (error) => {
        if (error) killRootFallback();
        else finish();
      });
      killer.once('error', killRootFallback);
    });
  }

  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        // If the child was not assigned the expected group, still terminate its
        // root process; detached POSIX children normally take the group branch.
        process.kill(pid, signal);
      } catch {
        // The command may have exited between the group and process signals.
      }
    }
  };

  return new Promise((resolve) => {
    // execWithTimeout starts a detached child on POSIX, so its PID is also the
    // process-group ID inherited by the shell, GDB, and the debuggee.
    signalGroup('SIGTERM');
    setTimeout(() => {
      signalGroup('SIGKILL');
      // Give the kernel a short interval to deliver the group-wide kill before
      // the caller removes the run's temporary directory.
      setTimeout(resolve, 100);
    }, 100);
  });
}

type ExecCallback = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void;
type StartCommand = (callback: ExecCallback) => ChildProcess;

function runCommandWithTimeout(start: StartCommand, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = null;
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    let settled = false;
    let termination: Promise<void> | null = null;
    let capturedStdout = '';
    let capturedStderr = '';

    const finish = (error?: Error, stdout = capturedStdout, stderr = capturedStderr) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        const errObj: any = new Error(timedOut ? error.message : (stderr || stdout || error.message));
        errObj.stdout = stdout;
        errObj.stderr = stderr;
        reject(errObj);
      } else {
        resolve({ stdout, stderr });
      }
    };

    const finishTimedOut = () => {
      const error: any = new Error(`Quá thời gian thực thi cho phép (${timeoutMs / 1000}s)`);
      error.stdout = capturedStdout;
      error.stderr = capturedStderr;
      finish(error, capturedStdout, capturedStderr);
    };

    try {
      child = start((error, stdout, stderr) => {
        capturedStdout = String(stdout || '');
        capturedStderr = String(stderr || '');
        if (timedOut) return;
        if (error) finish(error, capturedStdout, capturedStderr);
        else finish(undefined, capturedStdout, capturedStderr);
      });

      child.once('error', (error) => {
        if (timedOut) return;
        finish(error);
      });

      if (!settled) {
        timer = setTimeout(() => {
          if (settled) return;
          timedOut = true;
          termination = child?.pid ? terminateProcessTree(child.pid) : Promise.resolve();
          // Do not wait for exec's callback: inherited stdio from an orphaned
          // descendant must not keep this promise, the slot, or temp files alive.
          void termination.then(finishTimedOut, finishTimedOut);
        }, timeoutMs);
      }
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
    (callback) => exec(command, { ...options, detached: process.platform !== 'win32' }, callback),
    timeoutMs
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
    (callback) => execFile(file, args, {
      ...options,
      detached: process.platform !== 'win32',
      windowsHide: true
    }, callback),
    timeoutMs
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
      const errOut = compileErr.stderr || compileErr.stdout || compileErr.message;
      return {
        success: false,
        buildOutput: errOut,
        trace: []
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
      // Preserve a bounded timeout/interruption reason if GDB could not write a trace.
      gdbExecutionError = gdbErr?.message || String(gdbErr);
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
    return {
      success: false,
      buildOutput: `Lỗi hệ thống: ${err.message}`,
      trace: []
    };
  } finally {
    activeExecutions = Math.max(0, activeExecutions - 1);
    // Cleanup temp directory safely
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
