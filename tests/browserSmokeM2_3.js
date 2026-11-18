const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = path.resolve(
  process.env.FLOWLAB_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'dsa-flowlab-browser-m2-3')
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

async function runBrowserAcceptanceM2_3() {
  console.log('======================================================================');
  console.log('🚀 DSA FlowLab M2.3 Generalization & Educational Accuracy Browser Suite');
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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-flowlab-m2-3-chrome-'));
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

    // Ensure initial lesson has loaded before starting scenarios
    await waitFor(async () => evaluate("Boolean(document.querySelector('.cm-content')?.innerText.includes('TimKiemVaXoa'))"), 'Initial lesson load');
    await delay(300);

    // =========================================================================
    // SCENARIO 1: Array Mutation (Prefix Sums B_prefix_sums.cpp)
    // =========================================================================
    console.log('\n--- Scenario 1: Array Mutation (Prefix Sums B_prefix_sums.cpp) ---');
    const codePrefix = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'B_prefix_sums.cpp'), 'utf8');
    await pasteCode(codePrefix, 'cumSum');
    await clickRun();
    await waitForExecution('14 4');

    // Find step where cumSum[1] is mutated to 3
    const totalSteps1 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let prefixStep = -1;
    for (let s = 0; s < totalSteps1; s++) {
      await setStep(s);
      const cell1Info = await evaluate(`(() => {
        const cumSumCont = document.querySelector('[data-testid="array-container-cumSum"]');
        if (!cumSumCont) return { val: '', mutated: false };
        const cell = cumSumCont.querySelector('[data-testid="array-cell-1"]');
        if (!cell) return { val: '', mutated: false };
        const innerBox = cell.querySelector('.w-14') || cell;
        return {
          val: cell.textContent || '',
          mutated: innerBox.classList.contains('border-amber-400') || Boolean(cell.querySelector('.border-amber-400'))
        };
      })()`);
      if (cell1Info.val.includes('3') && cell1Info.mutated) {
        prefixStep = s;
        break;
      }
    }
    assert.ok(prefixStep > 0, 'Must find step where cumSum[1] is mutated to 3');
    await setStep(prefixStep);

    // Verify array canvas and cell 1
    const hasArrayCanvas = await evaluate("Boolean(document.querySelector('[data-testid=\"array-variables-canvas\"]'))");
    assert.ok(hasArrayCanvas, 'Must render array variables canvas with cumSum');
    const cell1Val = await evaluate(`(() => {
      const cumSumCont = document.querySelector('[data-testid="array-container-cumSum"]');
      return cumSumCont?.querySelector('[data-testid="array-cell-1"]')?.textContent || '';
    })()`);
    assert.ok(cell1Val.includes('3') && cell1Val.includes('[1]'), 'Cell [1] of cumSum must display value 3');

    // Verify educational facets
    const upcoming1 = await evaluate("document.querySelector('[data-testid=\"explanation-upcoming\"]')?.textContent || ''");
    const observed1 = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    const semantics1 = await evaluate("document.querySelector('[data-testid=\"explanation-semantics\"]')?.textContent || ''");
    assert.ok(upcoming1.includes('Sắp thực hiện:'), 'Must show upcoming facet');
    assert.ok(observed1.includes('Quan sát:'), 'Must show observed facet');
    assert.ok(semantics1.includes('Ý nghĩa:'), 'Must show semantics facet');
    assert.ok(!observed1.includes('763385576'), 'Observed facet must not contain uninitialized stack garbage');

    await saveScreenshot('m2-3-01-prefix-sums-array-mutation.png');
    console.log('✅ Scenario 1 (Prefix sums array mutation) PASS');

    // =========================================================================
    // SCENARIO 2: Recursive Call Stack (GCD C_euclidean_gcd.cpp)
    // =========================================================================
    console.log('\n--- Scenario 2: Recursive Call Stack (GCD C_euclidean_gcd.cpp) ---');
    const codeGcd = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'C_euclidean_gcd.cpp'), 'utf8');
    await pasteCode(codeGcd, 'gcdRecursive');
    await clickRun();
    await waitForExecution('6 6');

    // Step to deepest recursive call of gcdRecursive(54, 24)
    const totalSteps2 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let deepStepGcd = -1;
    for (let s = 0; s < totalSteps2; s++) {
      await setStep(s);
      const frameCount = await evaluate("Number(document.querySelector('[data-testid=\"stack-frame-count\"]')?.textContent.replace(/\\D/g, '') || 0)");
      if (frameCount >= 4) {
        deepStepGcd = s;
        break;
      }
    }
    assert.ok(deepStepGcd > 0, 'Must reach depth 4 in gcdRecursive(54, 24) recursion');
    await setStep(deepStepGcd);

    // Verify distinct frame renders (frame 0 is main, higher depths are recursive calls)
    const frame0 = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-0\"]')?.textContent || ''");
    const frame1 = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-1\"]')?.textContent || ''");
    const frame3 = await evaluate("document.querySelector('[data-testid=\"call-stack-frame-3\"]')?.textContent || ''");
    assert.ok(frame0.includes('main'), 'Base frame 0 must be main');
    assert.ok(frame1.includes('gcdRecursive'), 'Intermediate frame 1 must be gcdRecursive');
    assert.ok(frame3.includes('gcdRecursive'), 'Innermost frame 3 must be gcdRecursive');

    // Verify pure recursion hides irrelevant static arrays block
    const hasArrayInGcd = await evaluate("Boolean(document.querySelector('[data-testid^=\"array-container-\"]'))");
    assert.strictEqual(hasArrayInGcd, false, 'Pure recursion must hide irrelevant static arrays block');

    await saveScreenshot('m2-3-02-recursive-gcd-call-stack.png');
    console.log('✅ Scenario 2 (Recursive GCD call stack) PASS');

    // =========================================================================
    // SCENARIO 3: Unfamiliar Custom Struct (Custom Tree F_custom_tree.cpp)
    // =========================================================================
    console.log('\n--- Scenario 3: Unfamiliar Custom Struct (Custom Tree F_custom_tree.cpp) ---');
    const codeTree = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'F_custom_tree.cpp'), 'utf8');
    await pasteCode(codeTree, 'sumKeys');
    await clickRun();
    await waitForExecution('30');

    // Verify Linked List canvas honestly reports 0 nodes, avoiding false linear topology
    await click('[data-testid="canvas-tab-linked-list"]');
    await delay(300);
    const linkedListCanvasText = await evaluate("document.querySelector('[data-testid=\"linked-list-canvas\"]')?.textContent || ''");
    assert.ok(linkedListCanvasText.includes('Tổng số ô nhớ: 0') || linkedListCanvasText.includes('Danh sách liên kết đang rỗng'),
      'Linked list canvas must honestly report 0 nodes, not fabricating linear topology from BinNode tree');

    // Switch to Arrays / Variables tab and check honesty
    await click('[data-testid="canvas-tab-arrays"]');
    await delay(200);
    const arrayVariablesText = await evaluate("document.querySelector('[data-testid=\"array-variables-canvas\"]')?.textContent || ''");
    assert.ok(arrayVariablesText.includes('Quy ước trước câu lệnh:') || arrayVariablesText.includes('Khung lệnh'),
      'Must display variables canvas cleanly');

    await saveScreenshot('m2-3-03-custom-tree-honest-struct.png');
    console.log('✅ Scenario 3 (Honest custom struct handling without tree fabrication) PASS');

    // =========================================================================
    // SCENARIO 4: Generic but Honest Explanation (Binary Search A_binary_search.cpp)
    // =========================================================================
    console.log('\n--- Scenario 4: Generic but Honest Explanation (Binary Search A_binary_search.cpp) ---');
    const codeBinSearch = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'A_binary_search.cpp'), 'utf8');
    await pasteCode(codeBinSearch, 'findFirstOccurrence');
    await clickRun();
    await waitForExecution('1 -1');

    // Find step where while loop condition is evaluated
    const totalSteps4 = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0) + 1");
    let loopConditionStep = -1;
    for (let s = 0; s < totalSteps4; s++) {
      await setStep(s);
      const upcoming = await evaluate("document.querySelector('[data-testid=\"explanation-upcoming\"]')?.textContent || ''");
      if (upcoming.includes('low <= high') || upcoming.includes('while') || upcoming.includes('điều kiện')) {
        loopConditionStep = s;
        break;
      }
    }
    assert.ok(loopConditionStep >= 0, 'Must find step evaluating loop condition');
    await setStep(loopConditionStep);

    // Verify natural Vietnamese before-statement label and honest facets
    const canvasText = await evaluate("document.querySelector('[data-testid=\"array-variables-canvas\"]')?.textContent || ''");
    assert.ok(canvasText.includes('Quy ước trước câu lệnh:'), 'Must show natural Vietnamese before-statement convention');
    assert.ok(!canvasText.includes('(Before-Statement)'), 'Beginner mode must not leak raw English convention badge');

    const upcoming4 = await evaluate("document.querySelector('[data-testid=\"explanation-upcoming\"]')?.textContent || ''");
    const observed4 = await evaluate("document.querySelector('[data-testid=\"explanation-observed\"]')?.textContent || ''");
    assert.ok(upcoming4.includes('Sắp thực hiện:'), 'Must show upcoming facet');
    assert.ok(observed4.includes('Quan sát:'), 'Must show observed facet');

    await saveScreenshot('m2-3-04-generic-honest-explanation.png');
    console.log('✅ Scenario 4 (Generic honest explanation on loop condition) PASS');

    // =========================================================================
    // SCENARIO 5A: Explicit Failure (Compilation Error N2_compile_error.cpp)
    // =========================================================================
    console.log('\n--- Scenario 5A: Compilation Error (N2_compile_error.cpp) ---');
    const codeCompileError = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'N2_compile_error.cpp'), 'utf8');
    await pasteCode(codeCompileError, 'invalidScalar');
    await clickRun();

    // Verify console build error is displayed
    await waitFor(async () => {
      const errText = await evaluate("document.querySelector('[data-testid=\"console-build-error\"]')?.textContent || ''");
      return errText.includes('invalid conversion') || errText.includes('error:') || errText.length > 0;
    }, 'Compilation build error banner');

    const buildErrorText = await evaluate("document.querySelector('[data-testid=\"console-build-error\"]')?.textContent || ''");
    assert.ok(buildErrorText.includes('invalid conversion') || buildErrorText.includes('error:'),
      'Must display compiler diagnostics without crashing');

    // Verify editor remains intact
    const editorStillPresent = await evaluate("Boolean(document.querySelector('.cm-content'))");
    assert.ok(editorStillPresent, 'Code editor must remain visible and functional during build error');

    await saveScreenshot('m2-3-05a-compile-error-banner.png');
    console.log('✅ Scenario 5A (Explicit compilation failure handling) PASS');

    // =========================================================================
    // SCENARIO 5B: Truncated Trace (Step Limit N1_step_limit.cpp)
    // =========================================================================
    console.log('\n--- Scenario 5B: Truncated Trace (Step Limit N1_step_limit.cpp) ---');
    const codeStepLimit = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm2_3', 'N1_step_limit.cpp'), 'utf8');
    await pasteCode(codeStepLimit, 'counter < 2000');
    await clickRun();

    // Verify termination status indicates truncation (program truncated before cout statement)
    await waitFor(async () => {
      const statusText = await evaluate("document.querySelector('[data-testid=\"termination-status\"]')?.textContent || ''");
      return statusText.includes('Vết thực thi bị cắt ngắn') || statusText.includes('cắt ngắn');
    }, 'Truncation status badge', 30000);

    const statusBadge = await evaluate("document.querySelector('[data-testid=\"termination-status\"]')?.textContent || ''");
    assert.ok(statusBadge.includes('Vết thực thi bị cắt ngắn') || statusBadge.includes('cắt ngắn'),
      'Must display truncation status warning for 2000-step loop');

    // Verify slider is interactable and clamped to step limit (1000 snapshots)
    const maxStep = await evaluate("Number(document.querySelector('input[type=\"range\"]')?.max || 0)");
    assert.ok(maxStep >= 999 && maxStep <= 1000, `Slider max must reflect truncation limit: ${maxStep}`);
    await setStep(maxStep);

    await saveScreenshot('m2-3-05b-step-limit-truncation.png');
    console.log('✅ Scenario 5B (Truncated trace step limit handling) PASS');

    // =========================================================================
    // RESPONSIVE VIEWPORT CHECKS & MODE COMPARISON
    // =========================================================================
    console.log('\n--- Responsive Viewport Verification & Mode Comparison ---');

    // 1. Laptop Viewport: 1366 × 768
    await setViewport(1366, 768);
    await delay(200);
    const overflow1366 = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(overflow1366, false, 'No horizontal page overflow at 1366x768');
    await saveScreenshot('m2-3-responsive-laptop-1366x768.png');
    console.log('✅ 1366×768 (Laptop) verified without horizontal overflow');

    // 2. Compact Desktop Viewport: 1280 × 720
    await setViewport(1280, 720);
    await delay(200);
    const overflow1280 = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(overflow1280, false, 'No horizontal page overflow at 1280x720');
    await saveScreenshot('m2-3-responsive-compact-1280x720.png');
    console.log('✅ 1280×720 (Compact Desktop) verified without horizontal overflow');

    // 3. Mobile Viewport: 390 × 844
    await setViewport(390, 844, true);
    await delay(200);
    const mobileOverflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.strictEqual(mobileOverflow, false, 'No horizontal page overflow at 390x844 mobile');

    const mobileTimelineExists = await evaluate("Boolean(document.querySelector('input[type=\"range\"]'))");
    assert.ok(mobileTimelineExists, 'Timeline slider must exist on mobile');

    await saveScreenshot('m2-3-responsive-mobile-390x844.png');
    console.log('✅ 390×844 (Mobile) verified without horizontal overflow');

    // 4. Mode comparison: Beginner vs Advanced on 1440 × 900
    await setViewport(1440, 900);
    await saveScreenshot('m2-3-comparison-beginner-1440x900.png');

    // Switch to Advanced Mode
    await click('button[title*="Chuyển đổi giữa chế độ"]');
    await delay(300);
    const isAdvanced = await evaluate("document.body.innerText.includes('Chế độ nâng cao')");
    assert.ok(isAdvanced, 'Must toggle to Advanced mode');
    await saveScreenshot('m2-3-comparison-advanced-1440x900.png');

    // Switch back to Beginner Mode
    await click('button[title*="Chuyển đổi giữa chế độ"]');
    await delay(300);
    console.log('✅ Beginner vs Advanced mode comparison captured');

    console.log('\n======================================================================');
    console.log('🎉 ALL 5 M2.3 BROWSER SCENARIOS & RESPONSIVE CHECKS PASSED!');
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
  runBrowserAcceptanceM2_3().catch(err => {
    console.error('❌ M2.3 Browser Acceptance Failed:', err);
    process.exit(1);
  });
}

module.exports = { runBrowserAcceptanceM2_3 };
