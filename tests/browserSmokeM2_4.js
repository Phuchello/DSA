const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures', 'm2_4');
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_M24_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-m2-4')
);
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, description, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find Google Chrome on this machine.');
}

function connectCdp(url, onEvent = () => {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();

    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          try { socket.close(); } catch {}
        },
      });
    });

    socket.addEventListener('message', event => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.id && pending.has(payload.id)) {
          const handler = pending.get(payload.id);
          pending.delete(payload.id);
          if (payload.error) handler.reject(new Error(payload.error.message));
          else handler.resolve(payload.result);
        } else if (payload.method) {
          onEvent(payload.method, payload.params);
        }
      } catch {}
    });

    socket.addEventListener('error', err => reject(err));
  });
}

async function runBrowserAcceptanceM2_4() {
  console.log('======================================================================');
  console.log('🌐 DSA FlowLab M2.4 Control-Flow Clarity Real Chrome Acceptance');
  console.log(`Artifact Directory: ${ARTIFACT_DIR}`);
  console.log('======================================================================');

  const serverEntry = path.join(ROOT, 'server', 'dist', 'index.js');
  const viteEntry = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
  assert.ok(fs.existsSync(serverEntry), 'Server dist/index.js must exist. Run npm run build first.');

  const serverLogs = [];
  const clientLogs = [];

  const server = spawn(process.execPath, [serverEntry], {
    cwd: ROOT,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '4000' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', chunk => serverLogs.push(String(chunk)));
  server.stderr.on('data', chunk => serverLogs.push(String(chunk)));

  const client = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: path.join(ROOT, 'client'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  client.stdout.on('data', chunk => clientLogs.push(String(chunk)));
  client.stderr.on('data', chunk => clientLogs.push(String(chunk)));

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-m2-4-chrome-'));
  let chrome;
  let pageCdp;
  let browserCdp;

  async function saveScreenshot(name) {
    const { data } = await pageCdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshotPath = path.join(ARTIFACT_DIR, name);
    fs.writeFileSync(screenshotPath, Buffer.from(data, 'base64'));
    console.log(`📸 Screenshot saved: ${name}`);
    return screenshotPath;
  }

  try {
    await waitFor(async () => {
      if (server.exitCode !== null) throw new Error(`Backend exited: ${serverLogs.join('')}`);
      try {
        const response = await fetch('http://127.0.0.1:4000/api/health');
        return response.ok;
      } catch {
        return false;
      }
    }, 'Backend health endpoint');

    await waitFor(async () => {
      if (client.exitCode !== null) throw new Error(`Frontend exited: ${clientLogs.join('')}`);
      try {
        const response = await fetch(APP_URL);
        return response.ok;
      } catch {
        return false;
      }
    }, 'Frontend web server');

    chrome = spawn(findChrome(), [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDir}`,
      APP_URL,
    ], { stdio: 'ignore', windowsHide: true });

    const portFile = path.join(profileDir, 'DevToolsActivePort');
    const portData = await waitFor(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited unexpectedly');
      return fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8') : null;
    }, 'DevTools active port file');

    const [debugPort] = portData.trim().split(/\r?\n/);
    const versionRes = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = await connectCdp(versionData.webSocketDebuggerUrl);

    const targetsRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page' && t.url.startsWith(APP_URL));
    assert.ok(pageTarget, 'Page target must exist');

    pageCdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await pageCdp.send('Page.enable');

    async function evaluate(expression) {
      const result = await pageCdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result?.value;
    }

    await pageCdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content'))"), 'CodeMirror editor load');
    await delay(300);

    async function pasteCode(text, expectedSnippet) {
      await evaluate(`(() => {
        const editor = document.querySelector('.cm-content');
        if (!editor) return false;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const dt = new DataTransfer();
        dt.setData('text/plain', ${JSON.stringify(text)});
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        return true;
      })()`);
      await waitFor(async () => {
        const content = await evaluate("document.querySelector('.cm-content')?.innerText || ''");
        return content.includes(expectedSnippet);
      }, `editor receiving ${expectedSnippet}`);
      await delay(300);
    }

    async function runAndWaitStdout(expectedStdout) {
      const clicked = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình'));
        if (button && !button.disabled) { button.click(); return true; }
        return false;
      })()`);
      assert.ok(clicked, 'Run button must be clicked');
      await waitFor(async () => {
        const stdout = await evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() || ''");
        return stdout.includes(expectedStdout);
      }, `execution stdout ${expectedStdout}`);
      await delay(250);
    }

    async function setStep(index) {
      await evaluate(`(() => {
        const slider = document.querySelector('input[type="range"]');
        if (slider) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(slider, ${index});
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await delay(180);
    }

    async function scanSteps() {
      const total = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
      const records = [];
      for (let s = 0; s < total; s++) {
        await setStep(s);
        const rec = await evaluate(`(() => ({
          step: ${s},
          upcoming: document.querySelector('[data-testid="explanation-upcoming"]')?.textContent || '',
          semantics: document.querySelector('[data-testid="explanation-semantics"]')?.textContent || ''
        }))()`);
        records.push(rec);
      }
      return records;
    }

    // Fixture 1 in Browser
    const f1Code = fs.readFileSync(path.join(FIXTURES_DIR, '01_window_bound_scan.cpp'), 'utf8');
    await pasteCode(f1Code, 'clampProbe');
    await runAndWaitStdout('1 10 2');
    const f1Records = await scanSteps();

    const whileTrueRec = f1Records.find(r => r.upcoming.includes('while (loBound < hiBound)') && r.semantics.includes('Đúng (true)'));
    const whileFalseRec = f1Records.find(r => r.upcoming.includes('while (loBound < hiBound)') && r.semantics.includes('Sai (false)'));
    const shadowedIfRec = f1Records.find(r => r.upcoming.includes('if (loBound > hiBound)') && r.semantics.includes('loBound = 1, hiBound = 2'));
    const compoundRec = f1Records.find(r => r.upcoming.includes('loBound >= 0') && r.semantics.includes('phức hợp'));

    assert.ok(whileTrueRec, 'Browser must display grounded while (loBound < hiBound) true semantics');
    assert.ok(whileFalseRec, 'Browser must display grounded while (loBound < hiBound) false semantics');
    assert.ok(shadowedIfRec, 'Browser must display active callee loBound=1, hiBound=2 in if check');
    assert.ok(compoundRec, 'Browser must display honest compound fallback semantics for &&');

    await setStep(whileTrueRec.step);
    await saveScreenshot('m2-4-01-clamp-while-true.png');
    await setStep(compoundRec.step);
    await saveScreenshot('m2-4-02-clamp-compound-fallback.png');
    console.log('✅ Fixture 01 rendered accurately in headless Chrome');

    // Reload clean page for Fixture 2
    await pageCdp.send('Page.reload');
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content'))"), 'Reload editor');
    await delay(300);

    const f2Code = fs.readFileSync(path.join(FIXTURES_DIR, '02_bool_flag_countdown.cpp'), 'utf8');
    await pasteCode(f2Code, 'stepCountdown');
    await runAndWaitStdout('2');
    const f2Records = await scanSteps();

    const boolTrueRec = f2Records.find(r => r.upcoming.includes('if (isArmed == false)') && r.semantics.includes('Đúng (true)'));
    const boolNegRec = f2Records.find(r => r.upcoming.includes('if (!isArmed)') && r.semantics.includes('Sai (false)'));
    assert.ok(boolTrueRec, 'Browser must display isArmed == false -> Đúng (true)');
    assert.ok(boolNegRec, 'Browser must display !isArmed -> Sai (false)');

    await setStep(boolTrueRec.step);
    await saveScreenshot('m2-4-03-bool-flag-true.png');
    console.log('✅ Fixture 02 rendered accurately in headless Chrome');

    console.log('\n🎉 ALL M2.4 REAL CHROME ACCEPTANCE CHECKS PASSED!');
  } finally {
    if (pageCdp) pageCdp.close();
    if (browserCdp) browserCdp.close();
    if (chrome) chrome.kill();
    if (client) client.kill();
    if (server) server.kill();
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  runBrowserAcceptanceM2_4().catch(err => {
    console.error('❌ M2.4 Browser Acceptance Failed:', err);
    process.exit(1);
  });
}

module.exports = { runBrowserAcceptanceM2_4 };
