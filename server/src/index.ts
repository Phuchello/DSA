import express, { Request, Response } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { runCppCode } from './runner/cppRunner.js';
import { LESSONS } from './lessons.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';

// ─── Security: Restrict CORS to trusted local development origins only ───────
// Do NOT use cors() without configuration: that allows any origin (CORS wildcard).
// We permit only localhost variants that the local Vite dev server runs on.
const TRUSTED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, server-side tools)
    if (!origin) return callback(null, true);
    if (TRUSTED_ORIGINS.includes(origin)) return callback(null, true);
    // Reject cross-origin requests from untrusted origins
    return callback(new Error(`CORS: Origin không được phép: ${origin}`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

// ─── Body parser: 1 MB limit ─────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Security: Host header validation (prevent DNS rebinding) ───────────────
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalHostHeader(hostHeader: string): boolean {
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

app.use((req: Request, res: Response, next) => {
  const host = req.headers.host;
  if (host && !isLocalHostHeader(host)) {
    return res.status(403).json({
      success: false,
      buildOutput: 'Truy cập bị từ chối: Máy chủ chỉ phục vụ các yêu cầu từ localhost (127.0.0.1).',
      trace: []
    });
  }
  next();
});

// Static client serving if built
const candidateDistPaths = [
  path.resolve(process.cwd(), 'client', 'dist'),
  path.resolve(process.cwd(), '..', 'client', 'dist'),
  path.resolve(__dirname, '..', '..', 'client', 'dist')
];
const clientDist = candidateDistPaths.find(p => fs.existsSync(p));
if (clientDist) {
  app.use(express.static(clientDist));
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'DSA FlowLab C++ Execution Server',
    engine: 'MinGW GCC + GDB Native Tracing Engine',
    boundHost: HOST,
    boundPort: PORT
  });
});

app.get('/api/lessons', (req: Request, res: Response) => {
  res.json({
    lessons: LESSONS
  });
});

app.post('/api/run', async (req: Request, res: Response) => {
  const { code, stdin } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      buildOutput: 'Dữ liệu không hợp lệ: Trường "code" là bắt buộc và phải là chuỗi.',
      trace: []
    });
  }

  if (code.length > 50000) {
    return res.status(400).json({
      success: false,
      buildOutput: 'Lỗi kích thước: Mã nguồn vượt quá giới hạn 50,000 ký tự cho phép.',
      trace: []
    });
  }

  const stdinText = typeof stdin === 'string' ? stdin : '';
  if (stdinText.length > 20000) {
    return res.status(400).json({
      success: false,
      buildOutput: 'Lỗi kích thước: Dữ liệu stdin vượt quá giới hạn 20,000 ký tự cho phép.',
      trace: []
    });
  }

  try {
    const result = await runCppCode(code, stdinText);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      buildOutput: `Lỗi máy chủ nội bộ: ${error?.message || error}`,
      trace: []
    });
  }
});

if (clientDist) {
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// Bind strictly to localhost / 127.0.0.1 by default
let serverInstance: any = null;
if (process.env.NODE_ENV !== 'test-manual') {
  serverInstance = app.listen(PORT, HOST, () => {
    console.log(`[DSA FlowLab] Server running strictly on http://${HOST}:${PORT}`);
  });
}

export { app, serverInstance };
