const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';

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

function findAllocatedTopologyStep(trace) {
  return trace.findIndex(point => {
    const liveNodes = point.dsa?.nodes?.filter(node => node.status === 'allocated') || [];
    const pointerNames = (point.dsa?.pointers || []).map(pointer => pointer.name);
    return liveNodes.length >= 2
      && pointerNames.some(name => name === 'L.pHead' || name === 'pHead')
      && pointerNames.some(name => name === 'L.pTail' || name === 'pTail');
  });
}

async function runBrowserSmoke() {
  const serverEntry = path.join(ROOT, 'server', 'dist', 'index.js');
  const viteEntry = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
  assert.ok(fs.existsSync(serverEntry), 'Build the server before running the browser smoke test.');
  assert.ok(fs.existsSync(viteEntry), 'Install client dependencies before running the browser smoke test.');

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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-chrome-'));
  let chrome;
  let pageCdp;
  let browserCdp;

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

    try {
      const frontendResponse = await waitFor(async () => {
        if (client.exitCode !== null) throw new Error(`Vite exited: ${clientLogs.join('')}`);
        const response = await fetch(APP_URL);
        return { ok: response.ok, status: response.status, url: response.url };
      }, 'the local Vite frontend');
      assert.ok(frontendResponse.ok, `Vite returned HTTP ${frontendResponse.status} for ${frontendResponse.url}`);
    } catch (error) {
      throw new Error(`${error.message}; Vite output: ${clientLogs.join('') || '(empty)'}`);
    }

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
    const [debugPort, browserPath] = activePortContents.trim().split(/\r?\n/);
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    browserCdp = await connectCdp(version.webSocketDebuggerUrl);

    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const pageTarget = targets.find(target => target.type === 'page' && target.url.startsWith(APP_URL));
    assert.ok(pageTarget, 'Chrome must open the local app page.');
    pageCdp = await connectCdp(pageTarget.webSocketDebuggerUrl, message => {
      if (message.method === 'Network.requestWillBeSent' && message.params.request.url.endsWith('/api/run')) {
        runRequests.push({ requestId: message.params.requestId, body: message.params.request.postData || '' });
      }
      if (message.method === 'Network.responseReceived' && message.params.response.url.endsWith('/api/run')) {
        runResponses.set(message.params.requestId, message.params.response.url);
      }
    });

    const runRequests = [];
    const runResponses = new Map();
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.enable');
    await pageCdp.send('Network.enable');

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
      const clicked = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.disabled) return false; element.click(); return true; })()`);
      assert.ok(clicked, `Expected an enabled element for ${selector}`);
    }

    async function pressKey(key, code, modifiers = 0) {
      await pageCdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
      await pageCdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    }

    async function pasteTextIntoFocusedEditor(text) {
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
      assert.ok(pasted.includes('TimKiemVaXoa'), 'Expected CodeMirror to receive the pasted C++ source.');
    }

    async function replaceFocusedTextarea(text) {
      const focused = await evaluate(`(() => { const input = document.querySelector('[data-testid="stdin-textarea"]'); if (!input) return false; input.focus(); input.select(); return true; })()`);
      assert.ok(focused, 'Expected the stdin editor to be visible.');
      await pageCdp.send('Input.insertText', { text });
    }

    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa'))"), 'the loaded C++ lesson in CodeMirror');
    assert.ok(await evaluate("document.body.innerText.includes('Mã nguồn C++') && document.body.innerText.includes('Chạy chương trình')"), 'Vietnamese editor and run controls must render.');
    assert.ok(await evaluate("document.body.innerText.includes('Chế độ: Tập sự')"), 'Beginner mode must render in Vietnamese.');

    const lesson = await evaluate("fetch('/api/lessons').then(response => response.json()).then(data => data.lessons.find(item => item.id === 'it003-golden'))");
    assert.ok(lesson?.code, 'The golden linked-list C++ sample must be available.');
    await pasteTextIntoFocusedEditor(lesson.code);
    await waitFor(async () => evaluate("document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa')"), 'pasted C++ code');

    // Make a visible, compile-safe edit after pasting the sample.
    await evaluate("document.querySelector('.cm-content').focus(); window.getSelection().collapse(document.querySelector('.cm-content').firstChild, 0)");
    await pageCdp.send('Input.insertText', { text: '// browser smoke edit\n' });
    await waitFor(async () => evaluate("document.querySelector('.cm-content')?.innerText.startsWith('// browser smoke edit')"), 'the C++ editor change');

    await click('[data-testid="tab-stdin"]');
    const firstStdin = '3\n3 0 8\n3';
    await replaceFocusedTextarea(firstStdin);
    await waitFor(async () => evaluate(`document.querySelector('[data-testid="stdin-textarea"]')?.value === ${JSON.stringify(firstStdin)}`), 'the first stdin edit');

    const runButtonClicked = await evaluate("(() => { const button = Array.from(document.querySelectorAll('button')).find(item => item.innerText.includes('Chạy chương trình')); if (!button || button.disabled) return false; button.click(); return true; })()");
    assert.ok(runButtonClicked, 'The real browser run button must be enabled.');

    await waitFor(async () => evaluate(`document.querySelector('[data-testid="console-final-stdout"]')?.textContent.trim() === '0 8'`), 'actual stdout from the first C++ execution', 90000);
    assert.ok(await evaluate("document.body.innerText.includes('Đầu ra cuối cùng sau khi chương trình kết thúc')"), 'Buffered output must carry its final-output label.');
    assert.strictEqual(runRequests.length, 1, 'The browser must issue exactly one first run request.');
    const firstRequest = JSON.parse(runRequests[0].body);
    assert.strictEqual(firstRequest.stdin, firstStdin);
    assert.ok(firstRequest.code.startsWith('// browser smoke edit'), 'The executed request must contain the edited C++ source.');

    const firstResponseBody = await pageCdp.send('Network.getResponseBody', { requestId: runRequests[0].requestId });
    const firstResponseText = firstResponseBody.base64Encoded
      ? Buffer.from(firstResponseBody.body, 'base64').toString('utf8')
      : firstResponseBody.body;
    const firstRunResult = JSON.parse(firstResponseText);
    assert.strictEqual(firstRunResult.finalStdout.trim(), '0 8');
    const topologyStep = findAllocatedTopologyStep(firstRunResult.trace);
    assert.ok(topologyStep >= 0, 'The executed trace must contain a linked-list step with nodes, pHead, and pTail.');
    const topologyPointerNames = firstRunResult.trace[topologyStep].dsa.pointers.map(pointer => pointer.name);
    assert.ok(topologyPointerNames.includes('p'), 'The topology snapshot must include the traversal pointer p.');

    const startIndex = await evaluate("Number(document.querySelector('input[type=range]').value)");
    assert.strictEqual(startIndex, 0, 'A fresh trace must start at its first snapshot.');
    await click('button[title^="Tiến 1 bước"]');
    await waitFor(async () => evaluate("Number(document.querySelector('input[type=range]').value) === 1"), 'forward timeline navigation');
    await click('button[title^="Lùi 1 bước"]');
    await waitFor(async () => evaluate("Number(document.querySelector('input[type=range]').value) === 0"), 'backward timeline navigation');

    for (let index = 1; index <= topologyStep; index++) {
      await click('button[title^="Tiến 1 bước"]');
      await waitFor(async () => evaluate(`Number(document.querySelector('input[type=range]').value) === ${index}`), `timeline step ${index}`);
    }
    const canvasText = await evaluate(`document.querySelector('[data-testid="linked-list-canvas"]')?.innerText || ''`);
    const normalizedCanvasText = canvasText.toLocaleLowerCase();
    assert.ok(normalizedCanvasText.includes('chuỗi danh sách chính'), `The linked-list main topology must be visible; canvas text: ${canvasText}`);
    assert.ok(normalizedCanvasText.includes('phead:'), 'The linked-list head pointer must be visible.');
    assert.ok(normalizedCanvasText.includes('ptail'), 'The linked-list tail pointer must be visible.');
    assert.ok(normalizedCanvasText.includes('p (duyệt)'), 'The linked-list traversal pointer must be visible.');
    assert.ok(!normalizedCanvasText.includes('danh sách liên kết đang rỗng'), 'The topology must contain allocated nodes.');

    await click('button[title^="Chuyển đổi giữa chế độ"]');
    await waitFor(async () => evaluate("document.body.innerText.toLocaleLowerCase().includes('góc nhìn chuyên sâu') && document.body.innerText.toLocaleLowerCase().includes('ngăn xếp lệnh (call stack frames)')"), 'Advanced mode and its memory inspector');

    await click('[data-testid="tab-stdin"]');
    const secondStdin = '1\n7\n3';
    await replaceFocusedTextarea(secondStdin);
    await waitFor(async () => evaluate(`document.querySelector('[data-testid="stdin-textarea"]')?.value === ${JSON.stringify(secondStdin)}`), 'the second stdin edit');
    assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="stale-canvas-banner"]'))`), 'Editing stdin must mark the old trace stale.');

    const secondRunClicked = await evaluate("(() => { const button = Array.from(document.querySelectorAll('button')).find(item => item.innerText.includes('Chạy chương trình')); if (!button || button.disabled) return false; button.click(); return true; })()");
    assert.ok(secondRunClicked, 'The second browser execution must start.');
    await waitFor(async () => evaluate(`document.querySelector('[data-testid="console-final-stdout"]')?.textContent.trim() === '7'`), 'stdout from the second input', 90000);
    assert.strictEqual(runRequests.length, 2, 'The browser must issue exactly two execution requests.');
    const secondRequest = JSON.parse(runRequests[1].body);
    assert.strictEqual(secondRequest.stdin, secondStdin);
    assert.strictEqual(secondRequest.code, firstRequest.code);
    assert.strictEqual(await evaluate(`Boolean(document.querySelector('[data-testid="stale-canvas-banner"]'))`), false, 'A trace for current code and stdin must clear the stale warning.');
    assert.ok(await evaluate("document.body.innerText.includes('Đầu ra cuối cùng sau khi chương trình kết thúc')"), 'The second result must also be labeled as final output.');

    console.log('Browser smoke PASS: pasted and edited C++, changed stdin, observed stdout 0 8 then 7, stepped forward/back, inspected linked-list topology and pHead/pTail, switched Beginner/Advanced, and cleared stale trace after matching rerun.');
  } finally {
    try { pageCdp?.close(); } catch {}
    try { browserCdp?.send('Browser.close').catch(() => {}); } catch {}
    try { chrome?.kill(); } catch {}
    try { client.kill(); } catch {}
    try { server.kill(); } catch {}

    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDir);
    if (!resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) || !path.basename(resolvedProfile).startsWith('dsa-flowlab-chrome-')) {
      throw new Error('Refusing to clean up a Chrome profile outside its expected temp directory.');
    }
    try { fs.rmSync(resolvedProfile, { recursive: true, force: true }); } catch {}
  }
}

runBrowserSmoke().catch(error => {
  console.error(`Browser smoke FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
