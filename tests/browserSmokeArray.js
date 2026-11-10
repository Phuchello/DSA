const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-array')
);
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const ARRAY_PROGRAM_CODE = `#include <iostream>
using namespace std;

int main() {
    int a[5] = {5, 2, 8, 1, 9};
    int temp = a[0];
    a[0] = a[1];
    a[1] = temp;

    for (int i = 0; i < 5; i++) {
        cout << a[i] << " ";
    }

    return 0;
}`;

const evidence = {
  status: 'running',
  startedAt: new Date().toISOString(),
  appUrl: APP_URL,
  checks: [],
  browser: null,
  requests: [],
  consoleErrors: [],
  snapshotsObserved: [],
};

function writeEvidence() {
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'browser-array-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(ARTIFACT_DIR, 'browser-array.log'), `${line}\n`);
}

function recordCheck(name, details = {}) {
  evidence.checks.push({ name, details });
  log(`PASS ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
  writeEvidence();
}

writeEvidence();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, description, timeoutMs = 30000) {
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
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const chromePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!chromePath) {
    throw new Error('Chrome was not found. Set CHROME_PATH to a preinstalled Chrome executable.');
  }
  return chromePath;
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
          for (const [, item] of pending) {
            clearTimeout(item.timer);
            item.reject(new Error('CDP connection closed'));
          }
          pending.clear();
          socket.close();
        },
      });
    }, { once: true });

    socket.addEventListener('error', () => reject(new Error(`Could not connect to Chrome DevTools at ${url}`)), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result || {});
      } else {
        onEvent(message);
      }
    });
  });
}

async function runBrowserArrayAcceptance() {
  const serverEntry = path.join(ROOT, 'server', 'dist', 'index.js');
  const viteEntry = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
  assert.ok(fs.existsSync(serverEntry), 'Build the server before running the browser acceptance test.');
  assert.ok(fs.existsSync(viteEntry), 'Install client dependencies before running the browser acceptance test.');

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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-chrome-array-'));
  let chrome;
  let pageCdp;
  let browserCdp;
  let chromeVersion = null;

  async function saveScreenshot(name) {
    // Issue 4 fix: scroll array canvas into view before capturing (1440x900 viewport already set)
    try {
      await pageCdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="array-variables-canvas"]')?.scrollIntoView({ block: 'start', behavior: 'instant' })`,
        awaitPromise: false,
      });
    } catch (_) {}
    const { data } = await pageCdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshotPath = path.join(ARTIFACT_DIR, name);
    fs.writeFileSync(screenshotPath, Buffer.from(data, 'base64'));
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
    }, 'the local backend health endpoint');

    await waitFor(async () => {
      if (client.exitCode !== null) throw new Error(`Vite exited: ${clientLogs.join('')}`);
      try {
        const response = await fetch(APP_URL);
        return response.ok;
      } catch {
        return false;
      }
    }, 'the local Vite frontend');

    chrome = spawn(findChrome(), [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDir}`,
      APP_URL,
    ], { stdio: 'ignore', windowsHide: true });

    const activePortPath = path.join(profileDir, 'DevToolsActivePort');
    const activePortContents = await waitFor(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before opening DevTools.');
      return fs.existsSync(activePortPath) ? fs.readFileSync(activePortPath, 'utf8') : false;
    }, 'Chrome DevTools startup');
    const [debugPort] = activePortContents.trim().split(/\r?\n/);
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    chromeVersion = version.Browser || null;
    browserCdp = await connectCdp(version.webSocketDebuggerUrl);

    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const pageTarget = targets.find(target => target.type === 'page' && target.url.startsWith(APP_URL));
    assert.ok(pageTarget, 'Chrome must open the local app page.');

    const runRequests = [];
    pageCdp = await connectCdp(pageTarget.webSocketDebuggerUrl, message => {
      if (message.method === 'Network.requestWillBeSent' && message.params.request.url.endsWith('/api/run')) {
        const body = message.params.request.postData || '';
        runRequests.push({ requestId: message.params.requestId, body });
      }
      if (message.method === 'Runtime.exceptionThrown') {
        evidence.consoleErrors.push({
          type: 'exception',
          text: message.params.exceptionDetails?.text || 'Runtime exception',
          exception: message.params.exceptionDetails?.exception?.description,
        });
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        evidence.consoleErrors.push({
          type: 'console.error',
          text: (message.params.args || []).map(a => a.value || a.description || '').join(' '),
        });
      }
    });

    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.enable');
    await pageCdp.send('Network.enable');
    await pageCdp.send('Log.enable');

    // Issue 4 fix: set desktop viewport so array cells are visually rendered
    await pageCdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    evidence.browser = { userAgent: version.Browser || 'unknown', executable: findChrome() };
    recordCheck('Real Chrome opened the local application with native backend', {
      browser: chromeVersion,
      appUrl: APP_URL,
    });

    async function evaluate(expression) {
      const response = await pageCdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
      }
      return response.result?.value;
    }

    async function click(selector) {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element || element.disabled) return false;
        element.click();
        return true;
      })()`);
      assert.ok(clicked, `Expected an enabled element for ${selector}`);
    }

    async function pasteCodeIntoEditor(text, expectedSnippet) {
      const pasted = await evaluate(`(() => {
        const editor = document.querySelector('.cm-content');
        if (!editor) return false;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', ${JSON.stringify(text)});
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        return editor.innerText;
      })()`);
      if (expectedSnippet) {
        assert.ok(pasted.includes(expectedSnippet), `Expected CodeMirror to receive: ${expectedSnippet}`);
      }
      return pasted;
    }

    async function replaceFocusedTextarea(text) {
      const focused = await evaluate(`(() => {
        const input = document.querySelector('[data-testid="stdin-textarea"]');
        if (!input) return false;
        input.focus();
        input.select();
        return true;
      })()`);
      assert.ok(focused, 'Expected the stdin editor to be visible.');
      await pageCdp.send('Input.insertText', { text });
    }

    // Step 1: Wait for CodeMirror and verify Vietnamese Beginner Mode UI
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content'))"), 'CodeMirror editor mount');
    assert.ok(await evaluate("document.body.innerText.includes('Chế độ dễ hiểu')"), 'Beginner mode must be default.');
    recordCheck('Default Beginner mode verified');

    // Step 2: Paste the M1.1 static array program
    await pasteCodeIntoEditor(ARRAY_PROGRAM_CODE, 'int a[5]');
    await waitFor(async () => evaluate("document.querySelector('.cm-content')?.innerText.includes('int temp = a[0];')"), 'pasted array code');
    recordCheck('Pasted M1.1 static array C++ program into CodeMirror');

    // Step 3: Run the program
    const runBtnClicked = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình'));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert.ok(runBtnClicked, 'Run button clicked.');

    // Step 4: Wait for execution response and stdout
    await waitFor(
      async () => evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() === '2 5 8 1 9'"),
      'actual stdout "2 5 8 1 9" from GDB execution',
      90000
    );
    recordCheck('Real C++ execution finished with expected stdout "2 5 8 1 9"');

    // Step 5: Verify Arrays & Variables tab is active and visible
    assert.ok(await evaluate("Boolean(document.querySelector('[data-testid=\"canvas-tab-arrays\"]'))"), 'Arrays tab button must exist');
    assert.ok(await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))"), 'ArrayVariablesCanvas must be rendered in Beginner mode');
    recordCheck('Default Beginner Mode displays Arrays & Variables tab and canvas');

    // Fetch the response body from CDP for exact timeline indexing
    const lastRequest = runRequests[runRequests.length - 1];
    const responseBody = await pageCdp.send('Network.getResponseBody', { requestId: lastRequest.requestId });
    const responseText = responseBody.base64Encoded
      ? Buffer.from(responseBody.body, 'base64').toString('utf8')
      : responseBody.body;
    const runResult = JSON.parse(responseText);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'array-run-response.json'), `${JSON.stringify(runResult, null, 2)}\n`);

    const trace = runResult.trace || [];
    assert.ok(trace.length >= 5, 'Execution trace must contain multiple steps');

    // Step 6: Verify 5 indexed array cells are visible at step 0
    const cellCount = await evaluate("document.querySelectorAll('[data-testid^=\"array-cell-\"]').length");
    assert.strictEqual(cellCount, 5, 'Five array cells [0]..[4] must be visible');
    recordCheck('Five indexed array cells visible', { cellCount });

    async function getArrayCellValues() {
      return evaluate(`(() => {
        const cells = Array.from(document.querySelectorAll('[data-testid^="array-cell-"]'));
        return cells.map(c => {
          const text = c.querySelector('div')?.innerText?.trim() || '';
          return text;
        });
      })()`);
    }

    async function getScalarVarValue(name) {
      return evaluate(`(() => {
        const card = document.querySelector('[data-testid="scalar-var-${name}"]');
        if (!card) return null;
        const valSpan = card.querySelector('.text-sm');
        return valSpan ? valSpan.innerText.trim() : null;
      })()`);
    }

    const stepBeforeAssign1 = trace.findIndex(s => s.codeText && s.codeText.includes('a[0] = a[1]'));
    const stepBeforeAssign2 = trace.findIndex(s => s.codeText && s.codeText.includes('a[1] = temp'));
    const stepLoop = trace.findIndex(s => s.codeText && s.codeText.includes('for (int i = 0'));

    assert.ok(stepBeforeAssign1 > 0, 'Found step before a[0] = a[1]');
    assert.ok(stepBeforeAssign2 > stepBeforeAssign1, 'Found step before a[1] = temp');
    assert.ok(stepLoop > stepBeforeAssign2, 'Found step at loop condition');

    log(`Key steps: beforeAssign1=${stepBeforeAssign1} (line ${trace[stepBeforeAssign1].line}), beforeAssign2=${stepBeforeAssign2} (line ${trace[stepBeforeAssign2].line}), loop=${stepLoop} (line ${trace[stepLoop].line})`);

    // Step 0: Line 5 (declaration step) - cells must show uninitialized state ('?' / 'chưa khởi tạo'), NOT garbage
    const hasUninitializedAtStep0 = await evaluate(`Boolean(document.querySelector('[data-testid="uninitialized-indicator"]'))`);
    assert.ok(hasUninitializedAtStep0, 'Array at step 0 declaration must display uninitialized indicator');
    const step0Values = await getArrayCellValues();
    assert.ok(step0Values.every(v => v.includes('?') || v.includes('chưa khởi tạo')), 'Array at step 0 must display uninitialized markers, got: ' + JSON.stringify(step0Values));
    const screenshotStep0 = await saveScreenshot('array-step0-uninitialized.png');
    recordCheck('Step 0 array declaration shows uninitialized state without garbage values', {
      line: trace[0].line,
      hasUninitialized: hasUninitializedAtStep0,
      values: step0Values,
      screenshot: path.basename(screenshotStep0),
    });

    // Step to `stepBeforeAssign1` (Line 7: a[0] = a[1])
    for (let s = 1; s <= stepBeforeAssign1; s++) {
      await click('button[title^="Tiến 1 bước"]');
      await waitFor(async () => evaluate(`Number(document.querySelector('input[type=range]').value) === ${s}`), `step ${s}`);
    }

    // Assert initial values before a[0] = a[1]
    const valuesBefore1 = await getArrayCellValues();
    assert.deepStrictEqual(valuesBefore1, ['5', '2', '8', '1', '9'], 'Array values before a[0]=a[1] must be [5, 2, 8, 1, 9]');
    const tempVal = await getScalarVarValue('temp');
    assert.strictEqual(tempVal, '5', 'Scalar variable temp must be 5');
    const screenshotBefore = await saveScreenshot('array-before-mutation.png');
    recordCheck('Snapshot before a[0] = a[1] still shows a[0] = 5 and temp = 5', {
      line: trace[stepBeforeAssign1].line,
      values: valuesBefore1,
      temp: tempVal,
      screenshot: path.basename(screenshotBefore),
    });

    // Step to `stepBeforeAssign2` (Line 8: a[1] = temp)
    for (let s = stepBeforeAssign1 + 1; s <= stepBeforeAssign2; s++) {
      await click('button[title^="Tiến 1 bước"]');
      await waitFor(async () => evaluate(`Number(document.querySelector('input[type=range]').value) === ${s}`), `step ${s}`);
    }

    // Assert subsequent snapshot shows a[0] = 2
    const valuesBefore2 = await getArrayCellValues();
    assert.strictEqual(valuesBefore2[0], '2', 'a[0] must be updated to 2');
    assert.strictEqual(valuesBefore2[1], '2', 'a[1] must still be 2 before a[1] = temp');
    const cell0Mutated = await evaluate("Boolean(document.querySelector('[data-testid=\"array-cell-0\"] .border-amber-400'))");
    assert.ok(cell0Mutated, 'Cell [0] must have amber mutation highlight');
    recordCheck('Subsequent snapshot shows a[0] = 2 with mutation highlight', {
      line: trace[stepBeforeAssign2].line,
      values: valuesBefore2,
      cell0Mutated,
    });

    // Step to `stepLoop` (Line 10: for (int i = 0; i < 5; i++))
    for (let s = stepBeforeAssign2 + 1; s <= stepLoop; s++) {
      await click('button[title^="Tiến 1 bước"]');
      await waitFor(async () => evaluate(`Number(document.querySelector('input[type=range]').value) === ${s}`), `step ${s}`);
    }

    // Assert after second assignment: array becomes [2, 5, 8, 1, 9]
    const valuesAfter = await getArrayCellValues();
    assert.deepStrictEqual(valuesAfter, ['2', '5', '8', '1', '9'], 'Array must become [2, 5, 8, 1, 9]');
    const screenshotAfter = await saveScreenshot('array-after-mutation.png');
    recordCheck('After second assignment, array becomes [2, 5, 8, 1, 9]', {
      line: trace[stepLoop].line,
      values: valuesAfter,
      screenshot: path.basename(screenshotAfter),
    });

    // Step 8: Verify no nonexistent linked-list pointer is mentioned for the ordinary array loop
    const educationalText = await evaluate("document.querySelector('[data-testid=\"educational-explanation\"]')?.innerText || document.body.innerText");
    assert.ok(!educationalText.includes('Con trỏ duyệt p đang ở địa chỉ'), 'Ordinary array loop must not claim pointer p traversal');
    assert.ok(!educationalText.includes('Con trỏ p'), 'Educational banner must not mention pointer p');
    recordCheck('No nonexistent linked-list pointer mentioned for array loop');

    // Step 9: Manual tab switching preserves the timeline
    const rangeValBeforeTab = await evaluate("Number(document.querySelector('input[type=range]').value)");
    await click('[data-testid="canvas-tab-linked-list"]');
    await waitFor(async () => evaluate("Boolean(document.querySelector('[data-testid=\"linked-list-canvas\"]'))"), 'LinkedListCanvas on tab switch');
    const rangeValOnListTab = await evaluate("Number(document.querySelector('input[type=range]').value)");
    assert.strictEqual(rangeValOnListTab, rangeValBeforeTab, 'Timeline step must be preserved when switching to linked-list tab');

    await click('[data-testid="canvas-tab-arrays"]');
    await waitFor(async () => evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))"), 'ArrayVariablesCanvas on tab switch back');
    const rangeValOnArrayTab = await evaluate("Number(document.querySelector('input[type=range]').value)");
    assert.strictEqual(rangeValOnArrayTab, rangeValBeforeTab, 'Timeline step must be preserved when switching back to arrays tab');
    recordCheck('Manual tab switching preserves timeline position', { preservedStep: rangeValBeforeTab });

    // Step 10: Verify browser console contains no unexpected exceptions
    const criticalErrors = evidence.consoleErrors.filter(e => !e.text.includes('warning') && !e.text.includes('act(...)'));
    assert.strictEqual(criticalErrors.length, 0, `Browser console has unexpected errors: ${JSON.stringify(criticalErrors)}`);
    recordCheck('Browser console contains no unexpected exceptions');

    // Step 11: Verify existing linked-list Golden Case remains usable
    const lessonGolden = await evaluate("fetch('/api/lessons').then(r => r.json()).then(d => d.lessons.find(l => l.id === 'it003-golden'))");
    assert.ok(lessonGolden?.code, 'Golden lesson available');
    await pasteCodeIntoEditor(lessonGolden.code, 'TimKiemVaXoa');
    await waitFor(async () => evaluate("document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa')"), 'pasted golden code');

    // Set stdin using replaceFocusedTextarea to trigger real browser events
    await click('[data-testid="tab-stdin"]');
    const goldenStdin = '3\n3 0 8\n3';
    await replaceFocusedTextarea(goldenStdin);
    await waitFor(async () => evaluate(`document.querySelector('[data-testid="stdin-textarea"]')?.value === ${JSON.stringify(goldenStdin)}`), 'golden stdin set');

    // Run golden code
    const goldenRunBtnClicked = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình'));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert.ok(goldenRunBtnClicked, 'Run golden code clicked');

    await waitFor(
      async () => evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() === '0 8'"),
      'actual stdout "0 8" from golden linked-list execution',
      90000
    );

    // Switch to linked-list tab and verify canvas displays active linked list
    await click('[data-testid="canvas-tab-linked-list"]');
    await waitFor(async () => evaluate("Boolean(document.querySelector('[data-testid=\"linked-list-canvas\"]'))"), 'LinkedListCanvas on tab switch for golden');
    recordCheck('Existing linked-list Golden Case remains fully functional and renders linked-list canvas');

    evidence.status = 'success';
    evidence.completedAt = new Date().toISOString();
    writeEvidence();
    log('🎉 Real Chrome Array Acceptance Test PASS 100%');
  } finally {
    if (pageCdp) pageCdp.close();
    if (browserCdp) browserCdp.close();
    if (chrome) chrome.kill();
    if (client) client.kill();
    if (server) server.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

if (require.main === module) {
  runBrowserArrayAcceptance().catch(err => {
    console.error('Browser Array Acceptance FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runBrowserArrayAcceptance };
