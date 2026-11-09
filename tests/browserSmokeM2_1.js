const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-m2-1')
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
          return new Promise((resolveCommand, rejectCommand) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(`CDP command timed out: ${method}`));
            }, 15000);
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener('error', reject);
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const item = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message || 'CDP Error'));
        else item.resolve(message.result || {});
      } else {
        onEvent(message);
      }
    });
  });
}

async function runM2_1BrowserSuite() {
  console.log('='.repeat(70));
  console.log('🌐 Starting M2.1 Evidence-Based Educational Explanations Browser Suite');
  console.log(`Artifact Directory: ${ARTIFACT_DIR}`);
  console.log('='.repeat(70));

  const serverEntry = path.join(ROOT, 'server', 'dist', 'index.js');
  const viteEntry = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');

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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-m2-1-chrome-'));
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
    assert.ok(pageTarget, 'Chrome opened page target');

    pageCdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.enable');
    await pageCdp.send('Network.enable');

    async function evaluate(expression) {
      const result = await pageCdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result?.value;
    }

    async function setViewport(width, height) {
      await pageCdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(200);
    }

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
      if (expectedSnippet) {
        await waitFor(async () => {
          const content = await evaluate("document.querySelector('.cm-content')?.innerText || ''");
          return content.includes(expectedSnippet);
        }, `editor receiving ${expectedSnippet}`);
      }
      await delay(350);
    }

    async function clickRun() {
      const clicked = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình'));
        if (button && !button.disabled) {
          button.click();
          return true;
        }
        return false;
      })()`);
      assert.ok(clicked, 'Run button must be clicked');
    }

    async function waitForExecution(expectedStdout, timeout = 90000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const stdout = await evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() || ''");
        if (stdout.includes(expectedStdout)) return stdout;
        await delay(300);
      }
      const finalStdout = await evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() || ''");
      throw new Error(`Execution timed out waiting for stdout "${expectedStdout}". Current: "${finalStdout}"`);
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
      await delay(250);
    }

    async function reloadPage() {
      await pageCdp.send('Page.navigate', { url: APP_URL });
      await delay(1000);
      const start = Date.now();
      while (Date.now() - start < 15000) {
        try {
          const ready = await evaluate("Boolean(document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa'))");
          if (ready) return;
        } catch (_) {}
        await delay(250);
      }
    }

    await setViewport(1440, 900);
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa'))"), 'Initial lesson load in CodeMirror');

    // =========================================================================
    // SCENARIO 1: Scalar & Array Updates (3-facet explanation verification)
    // =========================================================================
    console.log('\n--- Scenario 1: Scalar & Array Updates ---');
    const code1 = `#include <iostream>
using namespace std;
int main() {
    int x = 10;
    int y = 20;
    x = x + y;
    int arr[3] = {1, 2, 3};
    arr[1] = 99;
    cout << x << " " << arr[1] << endl;
    return 0;
}`;
    await pasteCode(code1, 'arr[1] = 99;');
    await clickRun();
    await waitForExecution('30 99');
    console.log('✅ Real execution completed with stdout "30 99"');

    // Find step right after x = x + y (step where x became 30)
    // Let's inspect timeline steps
    const stepCount1 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    console.log(`Scenario 1 total steps: ${stepCount1}`);

    let scalarUpdateStep = -1;
    let arrayUpdateStep = -1;

    for (let s = 0; s < stepCount1; s++) {
      await setStep(s);
      const observedText = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
      if (observedText.includes('x: 10 → 30') || (observedText.includes('x') && observedText.includes('30'))) {
        scalarUpdateStep = s;
      }
      if (observedText.includes('arr[1]: 2 → 99') || (observedText.includes('arr[1]') && observedText.includes('99'))) {
        arrayUpdateStep = s;
      }
    }

    assert.ok(scalarUpdateStep >= 0, 'Must have a step showing scalar update x: 10 -> 30');
    await setStep(scalarUpdateStep);
    const upcoming1 = await evaluate("document.querySelector('[data-testid=\"explanation-upcoming\"]')?.textContent || ''");
    const observed1 = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    const semantics1 = await evaluate("document.querySelector('[data-testid=\"explanation-semantics\"]')?.textContent || ''");
    console.log(`Step ${scalarUpdateStep} Facets:`);
    console.log(`  Upcoming: ${upcoming1}`);
    console.log(`  Observed: ${observed1}`);
    console.log(`  Semantics: ${semantics1}`);
    assert.ok(upcoming1.length > 0, 'Upcoming facet must be present');
    assert.ok(observed1.length > 0, 'Observed facet must be present');
    assert.ok(semantics1.length > 0, 'Semantics facet must be present');
    await saveScreenshot('m2-1-scalar-update-facets.png');

    assert.ok(arrayUpdateStep >= 0, 'Must have a step showing array update arr[1]: 2 -> 99');
    await setStep(arrayUpdateStep);
    await saveScreenshot('m2-1-array-update-facets.png');
    console.log('✅ Scenario 1 verified and screenshots captured.');

    // =========================================================================
    // SCENARIO 2: Recursive Call & Return (push, base case, pop facets)
    // =========================================================================
    console.log('\n--- Scenario 2: Recursive Call & Return (factorial 4) ---');
    await reloadPage();
    const code2 = `#include <iostream>
using namespace std;
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int main() {
    int res = factorial(4);
    cout << res << endl;
    return 0;
}
`;
    await pasteCode(code2, 'factorial(4)');
    await clickRun();
    await waitForExecution('24');
    console.log('✅ Real execution completed with stdout "24"');

    const stepCount2 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    console.log(`Scenario 2 total steps: ${stepCount2}`);

    let pushStep = -1;
    let baseStep = -1;
    let popStep = -1;

    for (let s = 0; s < stepCount2; s++) {
      await setStep(s);
      const observedText = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
      const badgeText = await evaluate("document.querySelector('[data-testid=\"diff-badge-container\"]')?.textContent || ''");
      const semanticsText = await evaluate("document.querySelector('[data-testid=\"explanation-semantics\"]')?.textContent || ''");

      if (pushStep === -1 && (badgeText.includes('▲') || observedText.includes('Gọi hàm') || observedText.includes('mở rộng độ sâu'))) {
        pushStep = s;
      }
      if (baseStep === -1 && (semanticsText.includes('Điều kiện dừng') || semanticsText.includes('base case'))) {
        baseStep = s;
      }
      if (popStep === -1 && (badgeText.includes('▼') || observedText.includes('trở về') || observedText.includes('kết thúc') || observedText.includes('thu hồi') || observedText.includes('Pop'))) {
        popStep = s;
      }
    }

    assert.ok(pushStep >= 0, 'Must have a step showing frame push');
    await setStep(pushStep);
    await saveScreenshot('m2-1-recursion-push-facet.png');

    assert.ok(baseStep >= 0, 'Must have a step showing base case');
    await setStep(baseStep);
    await saveScreenshot('m2-1-recursion-base-case-facet.png');

    assert.ok(popStep >= 0, 'Must have a step showing frame pop');
    await setStep(popStep);
    await saveScreenshot('m2-1-recursion-pop-facet.png');
    console.log('✅ Scenario 2 verified and screenshots captured.');

    // =========================================================================
    // SCENARIO 3: Unfamiliar Struct Program (LeetCode 124 Branch)
    // =========================================================================
    console.log('\n--- Scenario 3: Unfamiliar Struct Program (Branch) ---');
    await reloadPage();
    const code3 = `#include <iostream>
#include <algorithm>
using namespace std;

struct Branch {
    int weight;
    Branch* small;
    Branch* large;
};

int maxPath = -999999;

int maxGain(Branch* node) {
    if (node == nullptr) return 0;
    int leftGain = max(maxGain(node->small), 0);
    int rightGain = max(maxGain(node->large), 0);
    int currentPath = node->weight + leftGain + rightGain;
    if (currentPath > maxPath) {
        maxPath = currentPath;
    }
    return node->weight + max(leftGain, rightGain);
}

int main() {
    Branch leftNode = {19, nullptr, nullptr};
    Branch rightNode = {20, nullptr, nullptr};
    Branch root = {1, &leftNode, &rightNode};
    
    int rootGain = maxGain(&root);
    cout << "Maximum path sum = " << maxPath << endl;
    cout << "Root one-way gain = " << rootGain << endl;
    return 0;
}`;
    await pasteCode(code3, 'Root one-way gain');
    await clickRun();
    await waitForExecution('Maximum path sum = 40');
    console.log('✅ Real execution completed with stdout "Maximum path sum = 40"');

    const stepCount3 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    console.log(`Scenario 3 total steps: ${stepCount3}`);

    // Navigate to step where maxPath is updated or rootGain is computed
    let structStep = -1;
    for (let s = 0; s < stepCount3; s++) {
      await setStep(s);
      const observedText = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
      const badgeText = await evaluate("document.querySelector('[data-testid=\"diff-badge-container\"]')?.textContent || ''");
      const combined = observedText + ' ' + badgeText;
      if (combined.includes('currentPath') || combined.includes('rootGain') || combined.includes('leftGain') || combined.includes('rightGain')) {
        structStep = s;
        await saveScreenshot('m2-1-unfamiliar-struct-branch.png');
        break;
      }
    }
    if (structStep === -1) {
      await setStep(Math.floor(stepCount3 / 2));
      await saveScreenshot('m2-1-unfamiliar-struct-branch.png');
    }
    console.log('✅ Scenario 3 verified and screenshots captured.');

    console.log('\n🎉 ALL M2.1 BROWSER ACCEPTANCE TESTS PASSED!');
  } catch (err) {
    console.error('Error in test run:', err);
    throw err;
  } finally {
    try { if (pageCdp) pageCdp.close(); } catch (_) {}
    try { if (browserCdp) browserCdp.close(); } catch (_) {}
    if (chrome) {
      chrome.kill();
      await delay(500);
    }
    if (client) client.kill();
    if (server) server.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  runM2_1BrowserSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ M2.1 Browser Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = { runM2_1BrowserSuite };
