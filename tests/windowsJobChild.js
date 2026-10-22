const fs = require('fs');
const { spawn } = require('child_process');

const [mode, ...args] = process.argv.slice(2);

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, filePath);
}

if (mode === 'leaf') {
  const [metadataPath, heartbeatPath, nonce, handleMode] = args;
  writeJsonAtomic(metadataPath, {
    pid: process.pid,
    parentPid: process.ppid,
    nonce,
    handleMode,
  });
  setInterval(() => fs.appendFileSync(heartbeatPath, `${process.pid}:${nonce}\n`), 25);
} else if (mode === 'parent') {
  const [metadataPath, basePath] = args;
  const children = ['inherited', 'isolated'].map(handleMode => {
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const metadata = `${basePath}-${handleMode}.json`;
    const heartbeat = `${basePath}-${handleMode}.heartbeat`;
    const child = spawn(process.execPath, [__filename, 'leaf', metadata, heartbeat, nonce, handleMode], {
      detached: true,
      windowsHide: true,
      stdio: handleMode === 'inherited' ? 'inherit' : ['ignore', 'ignore', 'ignore'],
    });
    return { pid: child.pid, metadata, heartbeat, nonce, handleMode };
  });
  writeJsonAtomic(metadataPath, { pid: process.pid, children });
  setInterval(() => {}, 1000);
} else {
  throw new Error(`Unknown Windows Job fixture mode: ${mode}`);
}
