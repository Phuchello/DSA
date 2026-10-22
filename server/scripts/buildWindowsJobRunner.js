const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'win32') {
  console.log('Skipping the Windows Job Object launcher build on a non-Windows host.');
  process.exit(0);
}

const sourceDirectory = path.resolve(__dirname, '..', 'src', 'runner');
const runnerSource = 'windowsJobRunner.cpp';
const runnerDirectory = process.argv.includes('--dev')
  ? sourceDirectory
  : path.resolve(__dirname, '..', 'dist', 'runner');
const absoluteRunnerOutput = path.join(runnerDirectory, 'windowsJobRunner.exe');
const runnerOutput = path.relative(sourceDirectory, absoluteRunnerOutput);
fs.mkdirSync(path.dirname(absoluteRunnerOutput), { recursive: true });

const compiler = process.env.CXX || 'g++';
const result = spawnSync(compiler, [
  '-std=c++17',
  '-O2',
  '-municode',
  '-static-libgcc',
  '-static-libstdc++',
  runnerSource,
  '-o',
  runnerOutput,
], { cwd: sourceDirectory, encoding: 'utf8', windowsHide: true });

if (result.error || result.status !== 0) {
  const details = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
  throw new Error(`Failed to build the Windows Job Object launcher with ${compiler}:\n${details}`);
}

console.log(`Built Windows Job Object launcher: ${absoluteRunnerOutput}`);
