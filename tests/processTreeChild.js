const fs = require('fs');
const { spawn } = require('child_process');

const [mode, pidFile, heartbeatFile] = process.argv.slice(2);
if (mode === 'leaf') {
  setInterval(() => fs.appendFileSync(heartbeatFile, '.'), 25);
} else {
  const child = spawn(process.execPath, [__filename, 'leaf', '', heartbeatFile], { stdio: 'ignore' });
  fs.writeFileSync(pidFile, JSON.stringify({ parent: process.pid, child: child.pid }));
  setInterval(() => {}, 1000);
}
