import express, { Request, Response } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { runCppCode } from './runner/cppRunner.js';
import { LESSONS } from './lessons.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    engine: 'MinGW GCC + GDB Native Tracing Engine'
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

  const stdinText = typeof stdin === 'string' ? stdin : '';

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

app.listen(PORT, () => {
  console.log(`[DSA FlowLab] Server running on http://localhost:${PORT}`);
});
