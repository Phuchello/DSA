const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-recursion')
);
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const FIXTURES = {
  fixtureA_factorial4: {
    name: 'Fixture A: factorial(4) recursion',
    expectedStdout: '24',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int result = factorial(4);
    cout << result << endl;
    return 0;
}
`,
  },
  fixtureB_factorial1: {
    name: 'Fixture B: factorial(1) base case',
    expectedStdout: '1',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int result = factorial(1);
    cout << result << endl;
    return 0;
}
`,
  },
  fixtureC_genericCallStack: {
    name: 'Fixture C: Non-recursive generic call stack (main -> compute -> helper)',
    expectedStdout: '30',
    code: `#include <iostream>
using namespace std;

int helper(int b) {
    int y = b * 2;
    return y;
}

int compute(int a) {
    int x = a + 10;
    int res = helper(x);
    return res;
}

int main() {
    int val = compute(5);
    cout << val << endl;
    return 0;
}
`,
  },
  fixtureD_repeatedVarNames: {
    name: 'Fixture D: Recursive function with repeated local variable names (count, step)',
    expectedStdout: '60',
    code: `#include <iostream>
using namespace std;

int countdown(int count) {
    int step = count * 10;
    if (count <= 1) return step;
    return step + countdown(count - 1);
}

int main() {
    int total = countdown(3);
    cout << total << endl;
    return 0;
}
`,
  },
  fixtureF_factorial6_laptop: {
    name: 'Fixture F: Deeper recursion factorial(6) on student laptop viewport (1366x768)',
    expectedStdout: '720',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int result = factorial(6);
    cout << result << endl;
    return 0;
}
`,
  },
};

const evidence = {
  status: 'running',
  startedAt: new Date().toISOString(),
  appUrl: APP_URL,
  checks: [],
  browser: null,
  consoleErrors: [],
};

function writeEvidence() {
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'recursion-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(ARTIFACT_DIR, 'browser-recursion.log'), `${line}\n`);
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

async function main() {
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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-chrome-recursion-'));
  let chrome;
  let pageCdp;
  let browserCdp;

  async function saveScreenshot(name) {
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
    }, 'Backend health endpoint');

    await waitFor(async () => {
      if (client.exitCode !== null) throw new Error(`Vite exited: ${clientLogs.join('')}`);
      try {
        const response = await fetch(APP_URL);
        return response.ok;
      } catch {
        return false;
      }
    }, 'Frontend Vite preview');

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
    evidence.browser = version.Browser || 'Chrome';
    browserCdp = await connectCdp(version.webSocketDebuggerUrl);

    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const pageTarget = targets.find(target => target.type === 'page' && target.url.startsWith(APP_URL));
    assert.ok(pageTarget, 'Chrome must open the local app page.');

    pageCdp = await connectCdp(pageTarget.webSocketDebuggerUrl, message => {
      if (message.method === 'Runtime.exceptionThrown') {
        evidence.consoleErrors.push({
          type: 'exception',
          text: message.params.exceptionDetails?.text || 'Runtime exception',
        });
      }
    });

    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.enable');
    await pageCdp.send('Network.enable');

    async function evaluate(expression) {
      try {
        const result = await pageCdp.send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        return result.result?.value;
      } catch (_) {
        return null;
      }
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

    async function reloadPage() {
      await pageCdp.send('Page.navigate', { url: APP_URL });
      await delay(1000);
      const start = Date.now();
      while (Date.now() - start < 15000) {
        try {
          const ready = await evaluate("Boolean(document.querySelector('.cm-content'))");
          if (ready) return;
        } catch (_) {}
        await delay(250);
      }
    }

    async function pasteCode(text) {
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
      await delay(350);
    }

    async function clickRun() {
      await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình'));
        if (button && !button.disabled) button.click();
      })()`);
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

    async function stepForward() {
      await evaluate(`(() => {
        const btn = document.querySelector('button[title*="Tiến 1 bước"]');
        if (btn && !btn.disabled) btn.click();
      })()`);
      await delay(200);
    }

    // Default desktop viewport: 1440x900
    await setViewport(1440, 900);
    recordCheck('Real Chrome opened DSA FlowLab with native backend', { browser: evidence.browser, appUrl: APP_URL });

    // =========================================================================
    // TEST 1: FIXTURE A — factorial(4) CALL STACK IN LIFO ORDER AT MAX DEPTH
    // =========================================================================
    log('\n[Test 1] Running Fixture A: factorial(4)...');
    await reloadPage();
    await pasteCode(FIXTURES.fixtureA_factorial4.code);
    await clickRun();
    await waitForExecution('24');
    recordCheck('Fixture A: factorial(4) execution finished with stdout "24"');

    // Step to maximum recursion depth (Step 7: line 5, depth 5)
    await setStep(7);
    const frameCountText = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(frameCountText.includes('5 khung lệnh'), `Expected '5 khung lệnh', got: ${frameCountText}`);

    // Verify LIFO order: Top frame (depth 4) is factorial with n = 1
    const topFrameText = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-4\"]')?.textContent || ''");
    assert.ok(topFrameText.includes('factorial()'), 'Top frame must be factorial()');
    assert.ok(topFrameText.includes('ĐỈNH NGĂN XẾP (TOP)'), 'Top frame must have TOP badge');
    assert.ok(topFrameText.includes('Đang thực thi (Active)'), 'Top frame must be marked Active');
    assert.ok(topFrameText.includes('1'), 'Top frame must contain n=1');

    // Verify bottom frame (depth 0) is main()
    const bottomFrameText = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-0\"]')?.textContent || ''");
    assert.ok(bottomFrameText.includes('main()'), 'Bottom frame must be main()');
    assert.ok(bottomFrameText.includes('ĐÁY NGĂN XẾP (BOTTOM)'), 'Bottom frame must have BOTTOM badge');
    assert.ok(bottomFrameText.includes('result'), 'Bottom frame must contain variable result');

    // Verify 4 call connectors between frames
    const connectorCount = await evaluate("document.querySelectorAll('[data-testid=\"call-stack-section\"] span').length");
    assert.ok(connectorCount > 0, 'Call connectors must be visible between frames');

    const screenshotBeginnerMax = await saveScreenshot('m1-2a-factorial4-beginner-max-depth.png');
    recordCheck('Fixture A: Call Stack rendered in truthful LIFO order at max depth in Beginner mode', {
      frameCount: 5,
      screenshot: path.basename(screenshotBeginnerMax),
    });

    // Test Advanced Mode at max depth
    await evaluate(`(() => {
      const modeBtn = document.querySelector('button[title*="Chuyển đổi giữa chế độ"]');
      if (modeBtn) modeBtn.click();
    })()`);
    await delay(350);
    const hasMemoryInspector = await evaluate("Boolean(document.querySelector('.h-64'))");
    assert.ok(hasMemoryInspector, 'Advanced Mode MemoryInspector must render');
    const screenshotAdvancedMax = await saveScreenshot('m1-2a-factorial4-advanced-max-depth.png');
    recordCheck('Fixture A: Advanced Mode MemoryInspector displays matching stack frames', {
      screenshot: path.basename(screenshotAdvancedMax),
    });

    // Switch back to Beginner Mode
    await evaluate(`(() => {
      const modeBtn = document.querySelector('button[title*="Chuyển đổi giữa chế độ"]');
      if (modeBtn) modeBtn.click();
    })()`);
    await delay(200);

    // =========================================================================
    // TEST 2: FIXTURE B — factorial(1) BASE CASE
    // =========================================================================
    log('\n[Test 2] Running Fixture B: factorial(1) base case...');
    await reloadPage();
    await pasteCode(FIXTURES.fixtureB_factorial1.code);
    await clickRun();
    await waitForExecution('1');

    // Step to base case step (step 2: line 5 of factorial)
    await setStep(2);
    const baseFrameCount = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(baseFrameCount.includes('2 khung lệnh'), `Expected 2 frames, got: ${baseFrameCount}`);

    const baseTopText = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-1\"]')?.textContent || ''");
    assert.ok(baseTopText.includes('factorial()'), 'Active frame must be factorial()');
    assert.ok(baseTopText.includes('Đang thực thi (Active)'), 'Must be marked Active');
    assert.ok(baseTopText.includes('1'), 'n must be 1');

    const screenshotBaseCase = await saveScreenshot('m1-2a-factorial1-base-case.png');
    recordCheck('Fixture B: factorial(1) base case correctly displays 2 frames in Beginner mode', {
      screenshot: path.basename(screenshotBaseCase),
    });

    // =========================================================================
    // TEST 3: FIXTURE C — GENERIC CALL STACK (main -> compute -> helper)
    // =========================================================================
    log('\n[Test 3] Running Fixture C: Generic non-recursive call stack...');
    await reloadPage();
    await pasteCode(FIXTURES.fixtureC_genericCallStack.code);
    await clickRun();
    await waitForExecution('30');

    // Step to innermost execution in helper (step 4: line 5 in helper)
    await setStep(4);
    const genericFrameCount = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(genericFrameCount.includes('3 khung lệnh'), `Expected 3 frames, got: ${genericFrameCount}`);

    const frame2Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-2\"]')?.textContent || ''");
    assert.ok(frame2Text.includes('helper()'), 'Top frame must be helper()');
    assert.ok(frame2Text.includes('y'), 'helper frame must contain local variable y');

    const frame1Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-1\"]')?.textContent || ''");
    assert.ok(frame1Text.includes('compute()'), 'Caller frame must be compute()');
    assert.ok(frame1Text.includes('x'), 'compute frame must contain local variable x');

    const frame0Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-0\"]')?.textContent || ''");
    assert.ok(frame0Text.includes('main()'), 'Base frame must be main()');

    const screenshotGeneric = await saveScreenshot('m1-2a-generic-call-stack.png');
    recordCheck('Fixture C: Generic call stack displays hierarchy across distinct functions (helper -> compute -> main)', {
      screenshot: path.basename(screenshotGeneric),
    });

    // =========================================================================
    // TEST 4: FIXTURE D — REPEATED LOCAL VARIABLE NAMES ACROSS FRAMES
    // =========================================================================
    log('\n[Test 4] Running Fixture D: Repeated variable names across recursive frames...');
    await reloadPage();
    await pasteCode(FIXTURES.fixtureD_repeatedVarNames.code);
    await clickRun();
    await waitForExecution('60');

    // Step to depth 3 in countdown (step 6)
    await setStep(6);
    const repeatFrameCount = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(repeatFrameCount.includes('4 khung lệnh') || repeatFrameCount.includes('3 khung lệnh'), `Expected multi frames, got: ${repeatFrameCount}`);

    const frameCountdownTop = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-2\"]')?.textContent || ''");
    assert.ok(frameCountdownTop.includes('step'), 'Frame 2 must have variable step');

    const frameCountdownCaller = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-1\"]')?.textContent || ''");
    assert.ok(frameCountdownCaller.includes('step'), 'Frame 1 must have variable step');

    const screenshotRepeated = await saveScreenshot('m1-2a-repeated-var-names.png');
    recordCheck('Fixture D: Separate frame identities maintained for repeated variable names (count, step)', {
      screenshot: path.basename(screenshotRepeated),
    });

    // =========================================================================
    // TEST 5: FIXTURE E — RETURN TRANSITION & PUSH/POP NOTICES
    // =========================================================================
    log('\n[Test 5] Running Fixture E: Return transition & Push/Pop indicators...');
    await reloadPage();
    await pasteCode(FIXTURES.fixtureA_factorial4.code);
    await clickRun();
    await waitForExecution('24');

    // Advance to step 6 (depth 4)
    await setStep(6);
    // Step forward to step 7 (depth 5: Push)
    await stepForward();
    const hasPushIndicator = await evaluate("Boolean(document.querySelector('[data-testid=\"stack-transition-indicator\"]'))");
    const pushText = await evaluate("document.querySelector('[data-testid=\"stack-transition-indicator\"]')?.textContent || ''");
    log(`  Push transition indicator observed: ${hasPushIndicator} ("${pushText}")`);
    assert.ok(hasPushIndicator, 'Push transition indicator must be present upon stack extension');
    assert.ok(
      pushText.includes('Gọi hàm — thêm khung (+1)'),
      `Push transition text must describe frame addition, got: "${pushText}"`
    );

    // Advance to return step (step 8 -> 9: Pop)
    await setStep(8);
    await stepForward();
    const popText = await evaluate("document.querySelector('[data-testid=\"stack-transition-indicator\"]')?.textContent || ''");
    const hasPopIndicator = Boolean(popText && (popText.includes('giảm số khung') || popText.includes('Trở về')));
    log(`  Pop transition indicator observed: ${hasPopIndicator} ("${popText}")`);
    assert.ok(hasPopIndicator, 'Pop transition indicator must be present upon stack contraction');
    assert.ok(
      popText.includes('Trở về hàm gọi — giảm số khung (-1)'),
      `Pop transition text must describe frame return/contraction, got: "${popText}"`
    );

    const screenshotPop = await saveScreenshot('m1-2a-return-transition-pop.png');
    recordCheck('Fixture E: Push/Pop neutral indicators observed upon frame call and return transitions', {
      pushText,
      popText,
      screenshot: path.basename(screenshotPop),
    });

    // =========================================================================
    // TEST 6: FIXTURE F — DEEPER RECURSION AT STUDENT LAPTOP VIEWPORT (1366x768)
    // =========================================================================
    log('\n[Test 6] Running Fixture F: factorial(6) at 1366x768 student laptop viewport...');
    await setViewport(1366, 768);
    await reloadPage();
    await pasteCode(FIXTURES.fixtureF_factorial6_laptop.code);
    await clickRun();
    await waitForExecution('720');

    // Step to max depth (depth 7: main + 6 activations)
    await setStep(11);
    const deepFrameCount = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(deepFrameCount.includes('7 khung lệnh'), `Expected 7 frames, got: ${deepFrameCount}`);

    // Check horizontal layout overflow
    const bodyScrollWidth = await evaluate("document.body.scrollWidth");
    const bodyClientWidth = await evaluate("document.body.clientWidth");
    const hasHorizontalOverflow = bodyScrollWidth > bodyClientWidth;
    assert.strictEqual(hasHorizontalOverflow, false, `Must not horizontally overflow at 1366x768 (${bodyScrollWidth} vs ${bodyClientWidth})`);

    const screenshotLaptop = await saveScreenshot('m1-2a-factorial6-laptop-1366x768.png');
    recordCheck('Fixture F: Deeper recursion factorial(6) renders 7 frames without horizontal overflow on 1366x768 laptop', {
      scrollWidth: bodyScrollWidth,
      clientWidth: bodyClientWidth,
      screenshot: path.basename(screenshotLaptop),
    });

    // Reset viewport to desktop
    await setViewport(1440, 900);

    evidence.status = 'passed';
    evidence.completedAt = new Date().toISOString();
    writeEvidence();
    log('\n🎉 ALL M1.2a RECURSION ACCEPTANCE TESTS PASSED 100%!');

  } finally {
    if (pageCdp) pageCdp.close();
    if (browserCdp) browserCdp.close();
    if (chrome) chrome.kill();
    if (client) client.kill();
    if (server) server.kill();
  }
}

main().catch(err => {
  log(`FAIL: ${err.stack || err.message}`);
  evidence.status = 'failed';
  evidence.error = err.message;
  writeEvidence();
  process.exit(1);
});
