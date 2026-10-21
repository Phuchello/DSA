const fs = require('fs');
const { spawn } = require('child_process');

const [mode, pidFile, heartbeatFile] = process.argv.slice(2);

function processGroupId(pid) {
  if (process.platform === 'win32') return null;
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[2]);
}

if (mode === 'leaf') {
  setInterval(() => fs.appendFileSync(heartbeatFile, '.'), 25);
} else {
  const child = spawn(process.execPath, [__filename, 'leaf', '', heartbeatFile], { stdio: 'inherit' });
  fs.writeFileSync(pidFile, JSON.stringify({ parent: process.pid, child: child.pid, parentGroup: processGroupId(process.pid), childGroup: processGroupId(child.pid) }));
  setInterval(() => {}, 1000);
}
