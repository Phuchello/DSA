const fs = require('fs');
const { spawn } = require('child_process');

const [mode, ...args] = process.argv.slice(2);

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, filePath);
}

function processGroupId(pid) {
  if (process.platform === 'win32') return null;
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/ +/)[2]);
}

function waitForFile(filePath, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${filePath}`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

if (mode === 'leaf') {
  const [, heartbeatFile] = args;
  setInterval(() => fs.appendFileSync(heartbeatFile, '.'), 25);
} else if (mode === 'late-leaf') {
  const [readyFile, heartbeatFile, nonce] = args;
  writeJsonAtomic(readyFile, { pid: process.pid, parentPid: process.ppid, nonce });
  setInterval(() => fs.appendFileSync(heartbeatFile, `${process.pid}:${nonce}\\n`), 25);
} else if (mode === 'late-parent') {
  const [pidFile, triggerFile, readyFile, heartbeatFile, spawnedPidFile] = args;
  writeJsonAtomic(pidFile, { parent: process.pid, parentGroup: processGroupId(process.pid) });
  setInterval(() => {}, 1000);
  waitForFile(triggerFile).then(async () => {
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const child = spawn(process.execPath, [__filename, 'late-leaf', readyFile, heartbeatFile, nonce], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    writeJsonAtomic(spawnedPidFile, { pid: child.pid, parentPid: process.pid, nonce });
  }).catch(error => {
    writeJsonAtomic(pidFile, { parent: process.pid, error: error.message });
    process.exitCode = 2;
  });
} else {
  const [pidFile, heartbeatFile] = args;
  const child = spawn(process.execPath, [__filename, 'leaf', '', heartbeatFile], { stdio: 'inherit' });
  fs.writeFileSync(pidFile, JSON.stringify({ parent: process.pid, child: child.pid, parentGroup: processGroupId(process.pid), childGroup: processGroupId(child.pid) }));
  setInterval(() => {}, 1000);
}
