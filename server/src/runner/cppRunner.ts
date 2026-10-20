import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as os from 'os';
import { normalizeTrace, NormalizedExecutionPoint } from '../normalizer/dsaNormalizer.js';

const execAsync = promisify(exec);

export interface RunResult {
  success: boolean;
  buildOutput?: string;
  trace: NormalizedExecutionPoint[];
  totalSteps?: number;
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

export async function runCppCode(code: string, stdinText: string = ''): Promise<RunResult> {
  // 1. Security Validation
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return {
        success: false,
        buildOutput: 'Bảo mật: Mã nguồn chứa các hàm hệ thống hoặc thư viện bị cấm vì lý do an toàn môi trường.',
        trace: []
      };
    }
  }

  if (code.length > 50000) {
    return {
      success: false,
      buildOutput: 'Lỗi kích thước: Mã nguồn vượt quá giới hạn 50,000 ký tự cho phép.',
      trace: []
    };
  }

  // 2. Setup ephemeral directory in user home (.dsa_flowlab_tmp) to avoid both:
  //    (a) non-ASCII path issues in MinGW ld.exe (e.g. "Môn học")
  //    (b) Windows Application Control (WDAC error 4551) blocking executables in %TEMP%
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const tempDir = path.join(homeDir, '.dsa_flowlab_tmp', runId);
  fs.mkdirSync(tempDir, { recursive: true });

  const sourceFile = path.join(tempDir, 'source.cpp');
  const exeFile = path.join(tempDir, 'flowlab_runner.exe');
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

  try {
    // 3. Compile with g++
    const compileCmd = `g++ -std=c++11 -g3 -O0 -mconsole -fno-omit-frame-pointer source.cpp -o flowlab_runner.exe`;
    try {
      await execAsync(compileCmd, { timeout: 10000, cwd: tempDir });
    } catch (compileErr: any) {
      const errOut = compileErr.stderr || compileErr.stdout || compileErr.message;
      return {
        success: false,
        buildOutput: errOut,
        trace: []
      };
    }

    // 4. Run GDB with Python Tracer
    const env = {
      ...process.env,
      FLOWLAB_TARGET_FILE: 'source.cpp',
      FLOWLAB_STDIN_FILE: stdinFile,
      FLOWLAB_STDOUT_FILE: stdoutFile,
      FLOWLAB_TRACE_FILE: traceFile,
      FLOWLAB_MAX_STEPS: '1000'
    };

    const gdbCmd = `gdb -batch -q -x tracer.py flowlab_runner.exe`;
    try {
      await execAsync(gdbCmd, { env, timeout: 20000, cwd: tempDir });
    } catch (gdbErr: any) {
      // GDB might exit with error if program hits crash or timeout
      // Check if trace.json was written anyway
    }

    // 5. Read trace.json
    if (!fs.existsSync(traceFile)) {
      return {
        success: false,
        buildOutput: 'Lỗi thực thi: Không thể tạo vết thực thi (Execution Trace). Có thể chương trình gặp lỗi bộ nhớ nghiêm trọng (Segmentation Fault) hoặc vòng lặp vô hạn.',
        trace: []
      };
    }

    const traceRaw = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
    const rawPoints = traceRaw.trace || [];

    if (rawPoints.length === 0) {
      let extra = '';
      const startLog = path.join(tempDir, 'gdb_start_error.log');
      const runLog = path.join(tempDir, 'gdb_run_error.log');
      if (fs.existsSync(startLog)) extra += fs.readFileSync(startLog, 'utf-8');
      if (fs.existsSync(runLog)) extra += fs.readFileSync(runLog, 'utf-8');
      return {
        success: false,
        buildOutput: `Vết thực thi rỗng: ${extra || 'Không thể bắt đầu tại hàm main'}`,
        trace: []
      };
    }

    // 6. Normalize trace for DSA Visualization
    const normalizedPoints = normalizeTrace(rawPoints);

    return {
      success: true,
      trace: normalizedPoints,
      totalSteps: normalizedPoints.length
    };
  } catch (err: any) {
    return {
      success: false,
      buildOutput: `Lỗi hệ thống: ${err.message}`,
      trace: []
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanErr) {
      // Ignore cleanup error
    }
  }
}
