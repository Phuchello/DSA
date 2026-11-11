const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-m2-2')
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

async function runBrowserAcceptanceM2_2() {
  console.log('======================================================================');
  console.log('🚀 DSA FlowLab M2.2 Beginner Learning Experience Acceptance Suite');
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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-m2-2-chrome-'));
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
    await pageCdp.send('Network.enable');

    async function evaluate(expression) {
      const result = await pageCdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result?.value;
    }

    async function setViewport(width, height, isMobile = false) {
      await pageCdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: isMobile,
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

    async function waitForExecution(expectedStdout) {
      await waitFor(async () => {
        const stdout = await evaluate("document.querySelector('[data-testid=\"console-final-stdout\"]')?.textContent.trim() || ''");
        return expectedStdout ? stdout.includes(expectedStdout) : stdout.length > 0;
      }, `execution stdout: ${expectedStdout || 'any'}`);
      await delay(200);
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
      await delay(200);
    }

    async function click(selector) {
      const ok = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) { el.click(); return true; }
        return false;
      })()`);
      assert.ok(ok, `Element must be clicked: ${selector}`);
      await delay(200);
    }

    async function reloadPage() {
      await pageCdp.send('Page.reload');
      await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content'))"), 'Page reload CodeMirror');
      await delay(400);
    }

    // Set standard desktop viewport
    await setViewport(1440, 900);
    await reloadPage();

    console.log('\n--- Scenario 6: Initial Golden Case Load ---');
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa'))"), 'Initial lesson load');
    await saveScreenshot('m2-2-06-golden-initial-1440x900.png');

    // =========================================================================
    // SCENARIO 1: Scalar Updates (x = 10 -> 30)
    // =========================================================================
    console.log('\n--- Scenario 1: Scalar Updates (x = 10 -> 30) ---');
    const codeScalar = `#include <iostream>
using namespace std;
int main() {
    int x = 10;
    cout << "x = " << x << endl;
    x = 30;
    cout << "x now = " << x << endl;
    return 0;
}`;
    await pasteCode(codeScalar, 'x now =');
    await clickRun();
    await waitForExecution('x now = 30');

    // Find step where x becomes 30
    const totalSteps1 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let scalarStep = -1;
    for (let s = 0; s < totalSteps1; s++) {
      await setStep(s);
      const observedText = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
      if (observedText.includes('30')) {
        scalarStep = s;
        break;
      }
    }
    assert.ok(scalarStep > 0, 'Must find step where x is updated to 30');
    await setStep(scalarStep);

    // Verify 4 educational facets on scalar update
    const upcoming1 = await evaluate("document.querySelector('[data-testid=\"explanation-upcoming\"]')?.textContent || ''");
    const observed1 = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    const semantics1 = await evaluate("document.querySelector('[data-testid=\"explanation-semantics\"]')?.textContent || ''");
    assert.ok(upcoming1.includes('Sắp thực hiện:'), 'Must show upcoming facet');
    assert.ok(observed1.includes('Quan sát:'), 'Must show observed facet');
    assert.ok(observed1.includes('10') && observed1.includes('30'), 'Observed facet must explain 10 -> 30 transition');
    assert.ok(semantics1.includes('Ý nghĩa:'), 'Must show semantics facet');

    // Verify scalar card has value 30
    const scalarVal = await evaluate("document.querySelector('[data-testid=\"scalar-var-x\"]')?.textContent || ''");
    assert.ok(scalarVal.includes('30'), 'Scalar card x must show 30');

    await saveScreenshot('m2-2-01-scalar-update-1440x900.png');
    console.log('✅ Scenario 1 (Scalar update) PASS');

    // =========================================================================
    // SCENARIO 2: Array Update (arr[1] = 2 -> 99)
    // =========================================================================
    console.log('\n--- Scenario 2: Array Update (arr[1] = 2 -> 99) ---');
    const codeArray = `#include <iostream>
using namespace std;
int main() {
    int arr[3] = {1, 2, 3};
    arr[1] = 99;
    cout << arr[0] << " " << arr[1] << " " << arr[2] << endl;
    return 0;
}`;
    await pasteCode(codeArray, 'arr[1] = 99;');
    await clickRun();
    await waitForExecution('1 99 3');

    const totalSteps2 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let arrayStep = -1;
    for (let s = 0; s < totalSteps2; s++) {
      await setStep(s);
      const cell1Text = await evaluate("document.querySelector('[data-testid=\"array-cell-1\"]')?.textContent || ''");
      const isMutated = await evaluate("Boolean(document.querySelector('[data-testid=\"array-cell-1\"] .border-amber-400'))");
      if (cell1Text.includes('99') && isMutated) {
        arrayStep = s;
        break;
      }
    }
    assert.ok(arrayStep > 0, 'Must find step where arr[1] becomes 99');

    // R01: Verify step 1 (after int arr[3]={1,2,3}; declaration executed)
    await setStep(1);
    const step1Observed = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    assert.ok(!step1Observed.includes('thay đổi từ'), `R01: Step 1 must NOT claim 'thay đổi từ': "${step1Observed}"`);
    assert.ok(!step1Observed.includes('763385576'), `R01: Step 1 must NOT leak stack garbage 763385576: "${step1Observed}"`);
    assert.ok(step1Observed.includes('được khởi tạo giá trị') || step1Observed.includes('khởi tạo giá trị'),
      `R01: Step 1 must state elements initialized: "${step1Observed}"`);

    await setStep(arrayStep);

    // Verify array section exists and displays cells
    const hasArraySection = await evaluate("Boolean(document.querySelector('[data-testid=\"array-container-arr\"]'))");
    assert.ok(hasArraySection, 'Must render array-container-arr');
    const cell1 = await evaluate("document.querySelector('[data-testid=\"array-cell-1\"]')?.textContent || ''");
    assert.ok(cell1.includes('99') && cell1.includes('[1]'), 'Cell 1 must show value 99 and index [1]');

    await saveScreenshot('m2-2-02-array-update-1440x900.png');
    console.log('✅ Scenario 2 (Array update) PASS');

    // =========================================================================
    // SCENARIO 3: factorial(4) recursion push, base case and pop
    // =========================================================================
    console.log('\n--- Scenario 3: factorial(4) Recursion ---');
    const codeRecursion = `#include <iostream>
using namespace std;
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int main() {
    int ans = factorial(4);
    cout << "ans = " << ans << endl;
    return 0;
}`;
    await pasteCode(codeRecursion, 'int ans = factorial(4);');
    await clickRun();
    await waitForExecution('ans = 24');

    const totalSteps3 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let pushObserved = false;
    let baseCaseObserved = false;
    let popObserved = false;
    let maxDepthStep = -1;
    let maxDepthCount = 0;

    for (let s = 0; s < totalSteps3; s++) {
      await setStep(s);
      const transitionText = await evaluate("document.querySelector('[data-testid=\"stack-transition-indicator\"]')?.textContent || ''");
      const semanticsText = await evaluate("document.querySelector('[data-testid=\"explanation-semantics\"]')?.textContent || ''");
      const frameCountText = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
      const frameCountMatch = frameCountText.match(/(\d+)/);
      const currentDepth = frameCountMatch ? Number(frameCountMatch[1]) : 0;

      if (currentDepth > maxDepthCount) {
        maxDepthCount = currentDepth;
        maxDepthStep = s;
      }

      if (transitionText.includes('Gọi hàm — thêm khung') || transitionText.includes('Gọi thêm hàm')) {
        pushObserved = true;
      }
      if (semanticsText.includes('Điều kiện dừng') || semanticsText.includes('base case')) {
        baseCaseObserved = true;
      }
      if (transitionText.includes('Trở về hàm gọi')) {
        popObserved = true;
      }
    }

    assert.ok(pushObserved, 'Must observe push transition indicator');
    assert.ok(baseCaseObserved, 'Must observe verified base-case semantics');
    assert.ok(popObserved, 'Must observe pop transition indicator');

    // F04 fix: Assert actual depth of 5 (main + factorial(4..1)) was reached
    assert.strictEqual(maxDepthCount, 5, 'factorial(4) must reach depth 5 (main + 4 recursive frames)');
    assert.ok(maxDepthStep > 0, 'Max depth step must be identified');

    // Navigate to max depth and verify all 5 frames are present in the DOM
    await setStep(maxDepthStep);
    const allFrameElements = await evaluate("document.querySelectorAll('[data-testid^=\"call-stack-frame-\"]').length");
    assert.strictEqual(allFrameElements, 5, 'All 5 call stack frame elements must be present in DOM at max depth');

    // Verify each frame exists and is scroll-reachable (R02)
    for (let d = 0; d < 5; d++) {
      const frameExists = await evaluate(`Boolean(document.querySelector('[data-testid="call-stack-frame-${d}"]'))`);
      assert.ok(frameExists, `call-stack-frame-${d} must exist at max depth`);

      const isReachable = await evaluate(`(() => {
        const frame = document.querySelector('[data-testid="call-stack-frame-${d}"]');
        if (!frame) return false;
        frame.scrollIntoView();
        const r = frame.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })()`);
      assert.ok(isReachable, `R02: call-stack-frame-${d} must be scroll-reachable at max depth`);
    }

    // Scroll back to top so topmost stack frame is in view
    await evaluate("document.querySelector('[data-testid=\"call-stack-frame-0\"]')?.scrollIntoView()");

    // Pure recursion should hide empty static arrays section
    const hasArraySectionInRecursion = await evaluate("Boolean(document.querySelector('[data-testid=\"capture-limit-note\"]') || document.querySelector('[data-testid^=\"array-container-\"]'))");
    assert.strictEqual(hasArraySectionInRecursion, false, 'Pure recursion must hide irrelevant empty arrays block');

    // Verify call stack frames rendered
    const stackFrameCount = await evaluate("document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent || ''");
    assert.ok(stackFrameCount.includes('khung lệnh'), 'Must render stack frame count');

    await saveScreenshot('m2-2-03-recursion-factorial4-1440x900.png');
    console.log('✅ Scenario 3 (Recursion push/base/pop) PASS');

    // =========================================================================
    // SCENARIO 4: Nested non-recursive function calls
    // =========================================================================
    console.log('\n--- Scenario 4: Nested Non-Recursive Function Calls ---');
    const codeNested = `#include <iostream>
using namespace std;
int add(int a, int b) {
    int res = a + b;
    return res;
}
int compute(int x) {
    int y = add(x, 15);
    return y;
}
int main() {
    int finalVal = compute(10);
    cout << "finalVal = " << finalVal << endl;
    return 0;
}`;
    await pasteCode(codeNested, 'int finalVal = compute(10);');
    await clickRun();
    await waitForExecution('finalVal = 25');

    // Step to deepest frame where add is executing
    const totalSteps4 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let deepStep4 = -1;
    for (let s = 0; s < totalSteps4; s++) {
      await setStep(s);
      const frameCount = await evaluate("Number(document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent.replace(/\\D/g, '') || 0)");
      if (frameCount >= 3) {
        deepStep4 = s;
        break;
      }
    }
    assert.ok(deepStep4 > 0, 'Must reach depth 3 (main -> compute -> add)');
    await setStep(deepStep4);

    const frame2Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-2\"]')?.textContent || ''");
    const frame1Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-1\"]')?.textContent || ''");
    const frame0Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-0\"]')?.textContent || ''");

    assert.ok(frame2Text.includes('add()'), 'Frame 2 must be add()');
    assert.ok(frame1Text.includes('compute()'), 'Frame 1 must be compute()');
    assert.ok(frame0Text.includes('main()'), 'Frame 0 must be main()');

    await saveScreenshot('m2-2-04-nested-calls-1440x900.png');
    console.log('✅ Scenario 4 (Nested non-recursive calls) PASS');

    // =========================================================================
    // SCENARIO 5: Unfamiliar Branch struct program
    // =========================================================================
    console.log('\n--- Scenario 5: Unfamiliar Branch Struct Program ---');
    const codeBranch = `#include <iostream>
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
    await pasteCode(codeBranch, 'struct Branch {');
    await clickRun();
    await waitForExecution('Maximum path sum = 40');

    // Step to when currentPath = 19 is observed
    const totalSteps5 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let branchStep = -1;
    for (let s = 0; s < totalSteps5; s++) {
      await setStep(s);
      const frame2Text = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-2\"]')?.textContent || ''");
      if (frame2Text.includes('currentPath') && frame2Text.includes('19')) {
        branchStep = s;
        break;
      }
    }
    assert.ok(branchStep > 0, 'Must find step where currentPath = 19 is in frame 2');
    await setStep(branchStep);

    // Verify honest unknown-struct notice appears when user struct is in memory
    const hasStructNotice = await evaluate("Boolean(document.querySelector('[data-testid=\"unknown-struct-notice\"]'))");
    assert.ok(hasStructNotice, 'Must display honest unknown struct notice');

    await saveScreenshot('m2-2-05-branch-struct-1440x900.png');
    console.log('✅ Scenario 5 (Unfamiliar Branch struct) PASS');

    // =========================================================================
    // SCENARIO 7: Compilation errors
    // =========================================================================
    console.log('\n--- Scenario 7: Compilation Errors ---');
    const codeError = `#include <iostream>
int main() {
    syntax_error_undefined_identifier;
    return 0;
}`;
    await pasteCode(codeError, 'syntax_error_undefined_identifier');
    await clickRun();

    await waitFor(async () => {
      const err = await evaluate("document.querySelector('[data-testid=\"console-build-error\"]')?.textContent || ''");
      return err.includes('syntax_error_undefined_identifier') || err.includes('error:');
    }, 'compiler error in console drawer');

    // Verify code editor is NOT hidden
    const editorStillVisible = await evaluate("Boolean(document.querySelector('.cm-content'))");
    assert.ok(editorStillVisible, 'Code editor must remain visible when compilation error occurs');

    // R05: Verify console auto-reopen on repeated identical compile error in browser
    const initialDrawerClass = await evaluate("document.querySelector('[data-testid=\"console-drawer\"]')?.className || ''");
    assert.ok(initialDrawerClass.includes('h-36'), 'Console drawer should initially be compact (h-36)');

    // Collapse console drawer: toggle twice (compact -> expanded -> collapsed)
    await click('[data-testid="console-toggle-size"]');
    await delay(200);
    await click('[data-testid="console-toggle-size"]');
    await delay(200);
    const collapsedClass = await evaluate("document.querySelector('[data-testid=\"console-drawer\"]')?.className || ''");
    assert.ok(collapsedClass.includes('h-8 overflow-hidden'), 'Console drawer must be collapsed (h-8 overflow-hidden)');

    // Re-run identical invalid code
    await clickRun();
    await delay(400);

    // Console drawer must auto-uncollapse back to compact
    await waitFor(async () => {
      const cls = await evaluate("document.querySelector('[data-testid=\"console-drawer\"]')?.className || ''");
      return cls.includes('h-36') && !cls.includes('h-8 overflow-hidden');
    }, 'console drawer auto-uncollapses on repeated compile error');

    const reopenedErr = await evaluate("document.querySelector('[data-testid=\"console-build-error\"]')?.textContent || ''");
    assert.ok(reopenedErr.includes('syntax_error_undefined_identifier') || reopenedErr.includes('error:'),
      'Compile error must be visible in reopened console');

    await saveScreenshot('m2-2-07-compilation-error-1440x900.png');
    console.log('✅ Scenario 7 (Compilation error) PASS');

    // =========================================================================
    // SCENARIO 8: Stale trace after editing
    // =========================================================================
    console.log('\n--- Scenario 8: Stale Trace After Editing ---');
    // First run valid code
    const codeValid = `#include <iostream>
using namespace std;
int main() {
    int v = 42;
    cout << "v = " << v << endl;
    return 0;
}`;
    await pasteCode(codeValid, 'int v = 42;');
    await clickRun();
    await waitForExecution('v = 42');

    // Now edit code in editor without clicking run
    await evaluate(`(() => {
      const editor = document.querySelector('.cm-content');
      if (!editor) return;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const dt = new DataTransfer();
      dt.setData('text/plain', '// edited line\\nint v = 99;\\n');
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    })()`);
    await delay(400);

    const staleBannerExists = await evaluate("Boolean(document.querySelector('[data-testid=\"stale-trace-banner\"]'))");
    const staleCanvasExists = await evaluate("Boolean(document.querySelector('[data-testid=\"stale-canvas-banner\"]'))");
    assert.ok(staleBannerExists || staleCanvasExists, 'Must display stale trace warning banner after code edit');

    await saveScreenshot('m2-2-08-stale-trace-1440x900.png');
    console.log('✅ Scenario 8 (Stale trace warning) PASS');

    // =========================================================================
    // SCENARIO 9: Empty/partial visualization
    // =========================================================================
    console.log('\n--- Scenario 9: Empty/Partial Visualization ---');
    await reloadPage();
    await delay(400);

    // Initial state before execution: Linked list canvas shows empty message
    const listEmptyText = await evaluate("document.querySelector('[data-testid=\"linked-list-canvas\"]')?.textContent || ''");
    assert.ok(listEmptyText.includes('Danh sách liên kết đang rỗng'), 'Linked list canvas must show empty list message');

    // Switch to Arrays canvas to verify its empty placeholder
    await click('[data-testid="canvas-tab-arrays"]');
    await delay(400);
    const arrayCanvasExists = await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))");
    const emptyText = await evaluate("document.querySelector('[data-testid=\"array-variables-canvas\"]')?.textContent || ''");
    console.log(`Scenario 9: arrayCanvasExists=${arrayCanvasExists}, text="${emptyText}"`);
    assert.ok(emptyText.includes('Chưa có dữ liệu biến hoặc mảng'), 'Must display clean honest empty placeholder');

    await saveScreenshot('m2-2-09-empty-state-1440x900.png');
    console.log('✅ Scenario 9 (Empty state) PASS');

    // =========================================================================
    // SCENARIO 10: Manual Tab Selection Across Navigation
    // =========================================================================
    console.log('\n--- Scenario 10: Manual Tab Selection Across Navigation ---');
    await pasteCode(codeArray, 'arr[1] = 99;');
    await clickRun();
    await waitForExecution('1 99 3');

    // Explicitly click Linked List tab
    await click('[data-testid="canvas-tab-linked-list"]');
    const onListTab = await evaluate("Boolean(document.querySelector('[data-testid=\"linked-list-canvas\"]'))");
    assert.ok(onListTab, 'Must switch to Linked List canvas on click');

    // Advance timeline step
    await setStep(2);
    const stillOnListTab = await evaluate("Boolean(document.querySelector('[data-testid=\"linked-list-canvas\"]'))");
    assert.ok(stillOnListTab, 'Manual tab selection must NOT be overridden by timeline step navigation');

    // Switch back to Arrays tab
    await click('[data-testid="canvas-tab-arrays"]');
    const onArrayTab = await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))");
    assert.ok(onArrayTab, 'Must switch back to Arrays canvas');

    // Verify keyboard arrow tab navigation does not modify timeline step (Fix 2)
    await evaluate(`(() => {
      const btn = document.querySelector('[data-testid="canvas-tab-arrays"]');
      if (btn) btn.focus();
      const tablist = document.querySelector('[role="tablist"]');
      if (tablist) {
        tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }));
      }
    })()`);
    await delay(150);

    const onListTabByArrow = await evaluate("Boolean(document.querySelector('[data-testid=\"linked-list-canvas\"]'))");
    const stepAfterArrowLeft = await evaluate("document.querySelector('input[type=\"range\"]')?.value");
    assert.ok(onListTabByArrow, 'ArrowLeft on tablist must switch active tab to Linked List canvas');
    assert.strictEqual(stepAfterArrowLeft, '2', 'ArrowLeft tab navigation must NOT modify timeline step');

    await evaluate(`(() => {
      const tablist = document.querySelector('[role="tablist"]');
      if (tablist) {
        tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
      }
    })()`);
    await delay(150);

    const onArrayTabByArrow = await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))");
    const stepAfterArrowRight = await evaluate("document.querySelector('input[type=\"range\"]')?.value");
    assert.ok(onArrayTabByArrow, 'ArrowRight on tablist must switch active tab back to Arrays canvas');
    assert.strictEqual(stepAfterArrowRight, '2', 'ArrowRight tab navigation must NOT modify timeline step');

    await saveScreenshot('m2-2-10-manual-tab-selection-1440x900.png');
    console.log('✅ Scenario 10 (Manual tab selection & keyboard isolation) PASS');

    // =========================================================================
    // SCENARIO 11: Zero-Initialized Array Provenance & Metadata Visibility
    // =========================================================================
    console.log('\n--- Scenario 11: Zero-Initialized Array Provenance & Metadata Visibility ---');
    const codeZeroArray = `#include <iostream>
using namespace std;
int main() {
    int a[3] = {0, 0, 0};
    a[0] = 5;
    cout << a[0] << " " << a[1] << " " << a[2] << endl;
    return 0;
}`;
    await pasteCode(codeZeroArray, 'int a[3] = {0, 0, 0};');
    await clickRun();
    await waitForExecution('5 0 0');

    // Step 1: After int a[3] = {0, 0, 0}; declaration executed
    await setStep(1);
    const step1ZeroObserved = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    assert.ok(!step1ZeroObserved.includes('thay đổi từ'), `Step 1 zero-init must NOT claim 'thay đổi từ': "${step1ZeroObserved}"`);
    assert.ok(step1ZeroObserved.includes('được khởi tạo giá trị 0') || step1ZeroObserved.includes('khởi tạo giá trị 0'),
      `Step 1 zero-init must report elements initialized to 0: "${step1ZeroObserved}"`);

    // Verify all 3 cells are rendered with value 0
    const cell0 = await evaluate("document.querySelector('[data-testid=\"array-cell-0\"]')?.textContent || ''");
    const cell1Z = await evaluate("document.querySelector('[data-testid=\"array-cell-1\"]')?.textContent || ''");
    const cell2Z = await evaluate("document.querySelector('[data-testid=\"array-cell-2\"]')?.textContent || ''");
    assert.ok(cell0.includes('0') && cell0.includes('[0]'), 'Cell 0 must show 0');
    assert.ok(cell1Z.includes('0') && cell1Z.includes('[1]'), 'Cell 1 must show 0');
    assert.ok(cell2Z.includes('0') && cell2Z.includes('[2]'), 'Cell 2 must show 0');

    // Beginner mode metadata assertions
    const beginnerCanvasText = await evaluate("document.querySelector('[data-testid=\"array-variables-canvas\"]')?.textContent || ''");
    assert.ok(beginnerCanvasText.includes('Quy ước trước câu lệnh:'), 'Beginner mode must use natural Vietnamese before-statement label');
    assert.ok(!beginnerCanvasText.includes('(Before-Statement)'), 'Beginner mode must NOT show (Before-Statement)');
    assert.ok(!beginnerCanvasText.includes('(Scalar Variables)'), 'Beginner mode must NOT show (Scalar Variables)');
    assert.ok(!beginnerCanvasText.includes('(1D Arrays)'), 'Beginner mode must NOT show (1D Arrays)');
    assert.ok(!beginnerCanvasText.includes('(TOP)'), 'Beginner mode must NOT show (TOP)');
    assert.ok(!beginnerCanvasText.includes('(Active)'), 'Beginner mode must NOT show (Active)');
    assert.ok(!beginnerCanvasText.includes('ID: '), 'Beginner mode must NOT display raw frame IDs');

    // Switch to Advanced Mode and assert technical metadata visibility
    await click('button[title*="Chuyển đổi giữa chế độ"]');
    await delay(300);
    const advancedCanvasText = await evaluate("document.querySelector('[data-testid=\"array-variables-canvas\"]')?.textContent || ''");
    assert.ok(advancedCanvasText.includes('(Before-Statement)'), 'Advanced mode must display (Before-Statement)');
    assert.ok(advancedCanvasText.includes('ID: '), 'Advanced mode must display frame IDs');

    // Switch back to Beginner Mode
    await click('button[title*="Chuyển đổi giữa chế độ"]');
    await delay(300);

    await saveScreenshot('m2-2-11-zero-init-and-mode-metadata.png');
    console.log('✅ Scenario 11 (Zero-initialized array provenance and Beginner/Advanced metadata) PASS');

    // =========================================================================
    // RESPONSIVE VIEWPORT TESTING & SCREENSHOTS
    // =========================================================================
    console.log('\n--- Responsive Viewport Verification ---');

    // 1. Laptop Viewport: 1366 × 768
    await setViewport(1366, 768);
    await setStep(1);
    await saveScreenshot('m2-2-responsive-laptop-1366x768.png');
    const overflow1366 = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(overflow1366, false, 'No horizontal page overflow at 1366x768');
    console.log('✅ 1366×768 (Laptop) verified without horizontal overflow');

    // 2. Compact Desktop Viewport: 1280 × 720
    await setViewport(1280, 720);
    await saveScreenshot('m2-2-responsive-compact-1280x720.png');
    const overflow1280 = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(overflow1280, false, 'No horizontal page overflow at 1280x720');
    console.log('✅ 1280×720 (Compact Desktop) verified without horizontal overflow');

    // 3. Mobile Viewport: 390 × 844 (R01 + R03)
    await setViewport(390, 844, true);

    // F05: Verify no unintentional horizontal page overflow on mobile
    const mobileOverflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(mobileOverflow, false, 'No horizontal page overflow at 390x844 mobile');

    // R03: Verify timeline controls are present and functional on mobile
    const mobileTimelineExists = await evaluate("Boolean(document.querySelector('input[type=\"range\"]'))");
    assert.ok(mobileTimelineExists, 'Timeline slider must exist on mobile');
    const mobileRunBtnExists = await evaluate("Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy chương trình')))");
    assert.ok(mobileRunBtnExists, 'Run button must be present on mobile');

    // R03: Interact with timeline slider on mobile
    await setStep(2);
    const mobileStep2Val = await evaluate("document.querySelector('input[type=\"range\"]')?.value");
    assert.strictEqual(mobileStep2Val, '2', 'Mobile timeline slider must be interactable and update to step 2');

    // Return to step 1 to inspect array initialization explanation (R01)
    await setStep(1);
    const mobileObserved = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    assert.ok(!mobileObserved.includes('thay đổi từ'), `R01: Mobile step 1 must NOT claim 'thay đổi từ': "${mobileObserved}"`);
    assert.ok(!mobileObserved.includes('763385576'), `R01: Mobile step 1 must NOT leak stack garbage: "${mobileObserved}"`);
    assert.ok(mobileObserved.includes('được khởi tạo giá trị') || mobileObserved.includes('khởi tạo giá trị'),
      `R01: Mobile step 1 must state elements initialized: "${mobileObserved}"`);

    // R03: Programmatically scroll canvas into viewport and assert reachability
    const mobileCanvasExists = await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))");
    assert.ok(mobileCanvasExists, 'Visualizer canvas must remain rendered on mobile');

    const canvasScrolledIntoView = await evaluate(`(() => {
      const el = document.querySelector('[data-testid="array-variables-canvas"]');
      if (!el) return false;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.height > 0 && r.width > 0;
    })()`);
    assert.ok(canvasScrolledIntoView, 'Canvas must be scroll-reachable and visible in viewport on mobile');

    // Capture mobile screenshot after scrolling to canvas
    await saveScreenshot('m2-2-responsive-mobile-390x844.png');
    console.log('✅ 390×844 (Mobile) verified: no overflow, timeline interactable, R01 clean, canvas scroll-reached and captured');

    // 4. Mode comparison: Beginner vs Advanced
    await setViewport(1440, 900);
    await saveScreenshot('m2-2-comparison-beginner-1440x900.png');

    // Toggle to Advanced Mode
    await click('button[title*="Chuyển đổi giữa chế độ"]');
    await delay(300);
    const isAdvanced = await evaluate("document.body.innerText.includes('Chế độ nâng cao')");
    assert.ok(isAdvanced, 'Must toggle to Advanced mode');
    await saveScreenshot('m2-2-comparison-advanced-1440x900.png');
    console.log('✅ Beginner vs Advanced mode comparison captured');

    console.log('\n======================================================================');
    console.log('🎉 ALL 11 M2.2 ACCEPTANCE SCENARIOS & RESPONSIVE CHECKS PASSED!');
    console.log('======================================================================');

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
  runBrowserAcceptanceM2_2().catch(err => {
    console.error('❌ M2.2 Browser Acceptance Failed:', err);
    process.exit(1);
  });
}

module.exports = { runBrowserAcceptanceM2_2 };
