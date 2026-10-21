const http = require('http');
const path = require('path');
const { fork } = require('child_process');
const assert = require('assert');
const { runNormalizerUnitTests } = require('./normalizerUnitTests.js');
const { runMemoryInvariantTests } = require('./test_invariants.js');
const { runProcessTreeTests } = require('./processTreeTests.js');

const BASE_GOLDEN_CODE = `#include <iostream>
using namespace std;

struct NODE {
    int info;
    NODE* pNext;
};

struct LIST {
    NODE* pHead;
    NODE* pTail;
};

void CreateEmptyList(LIST &L) {
    L.pHead = nullptr;
    L.pTail = nullptr;
}

NODE* CreateNode(int x) {
    NODE* p = new NODE;
    p->info = x;
    p->pNext = nullptr;
    return p;
}

void InsertTail(LIST &L, int x) {
    NODE* p = CreateNode(x);
    if (L.pHead == nullptr) {
        L.pHead = L.pTail = p;
    } else {
        L.pTail->pNext = p;
        L.pTail = p;
    }
}

void PrintList(const LIST &L) {
    if (L.pHead == nullptr) {
        cout << "-1" << endl;
        return;
    }
    NODE* p = L.pHead;
    while (p != nullptr) {
        cout << p->info << (p->pNext ? " " : "");
        p = p->pNext;
    }
    cout << endl;
}

void TimKiemVaXoa(LIST &L, int k) {
    NODE* p = L.pHead;
    NODE* prev = nullptr;
    while (p != nullptr) {
        if (p->info == k) {
            NODE* temp = p;
            if (p == L.pHead) {
                L.pHead = p->pNext;
                p = L.pHead;
                if (L.pHead == nullptr) {
                    L.pTail = nullptr;
                }
            } else {
                prev->pNext = p->pNext;
                if (p == L.pTail) {
                    L.pTail = prev;
                }
                p = p->pNext;
            }
            delete temp;
        } else {
            prev = p;
            p = p->pNext;
        }
    }
}

int main() {
    LIST L;
    CreateEmptyList(L);
    int n;
    if (!(cin >> n)) {
        PrintList(L);
        return 0;
    }
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        InsertTail(L, x);
    }
    int k;
    if (cin >> k) {
        TimKiemVaXoa(L, k);
    }
    PrintList(L);
    return 0;
}`;

function callApiRun(code, stdin) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ code, stdin });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/run',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
  });
}


function requestHealthWithHost(hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 4000, path: '/api/health', method: 'GET',
      headers: { host: hostHeader },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

function readFinalOutput(result) {
  if (typeof result?.finalStdout === 'string' && result.finalStdout.trim()) {
    return result.finalStdout.trim();
  }

  for (let i = (result?.trace?.length || 0) - 1; i >= 0; i--) {
    if (result.trace[i]?.stdout && result.trace[i].stdout.trim()) {
      return result.trace[i].stdout.trim();
    }
  }
  return '';
}

function assertTraceCompleteness(trace) {
  assert.ok(Array.isArray(trace) && trace.length > 0, 'Golden execution must contain snapshots');
  assert.ok(trace.every(step => step.snapshotConvention === 'before-statement'),
    'Every golden snapshot must retain before-statement semantics');

  const hasAllocation = trace.some(step => step.dsa.diff.allocatedNodes.length > 0);
  const hasInitialization = trace.some(step => step.dsa.nodes.some(node => node.info !== null && node.status !== 'freed'));
  const hasListEndpoints = trace.some(step => step.dsa.pointers.some(pointer => pointer.name === 'L.pHead'))
    && trace.some(step => step.dsa.pointers.some(pointer => pointer.name === 'L.pTail'));
  const hasTraversal = trace.some(step => step.dsa.pointers.some(pointer => pointer.name === 'p'))
    && trace.some(step => step.dsa.diff.pointerReroutes.some(change => change.pointer === 'p'));
  const hasUnlinking = trace.some(step => step.dsa.diff.unlinkedNodes.length > 0);
  const deleteStepIndex = trace.findIndex(step => step.codeText.trim().startsWith('delete '));
  const hasBeforeAfterDelete = deleteStepIndex >= 0
    && !trace[deleteStepIndex].dsa.nodes.some(node => node.status === 'freed')
    && trace.slice(deleteStepIndex + 1).some(step => step.dsa.diff.freedNodes.length > 0);
  const hasFunctionCalls = trace.some(step => step.event === 'call');
  const hasFunctionReturns = trace.slice(0, -1).some(step => step.event === 'return');
  const hasStudentVisibleChanges = trace.some(step => step.dsa.diff.changedVariables.length > 0
    || step.dsa.diff.allocatedNodes.length > 0
    || step.dsa.diff.freedNodes.length > 0
    || step.dsa.diff.unlinkedNodes.length > 0);

  if (!hasTraversal) {
    console.log(`  [TC-GOLDEN-01 traversal evidence] ${JSON.stringify(trace.map(step => ({
      funcName: step.funcName,
      line: step.line,
      codeText: step.codeText,
      pointers: step.dsa.pointers.filter(pointer => pointer.name === 'p').map(pointer => ({
        targetAddress: pointer.targetAddress,
        state: pointer.state
      })),
      reroutes: step.dsa.diff.pointerReroutes.filter(change => change.pointer === 'p')
    })))}`);
  }

  assert.ok(hasAllocation, 'Golden trace must show NODE allocations');
  assert.ok(hasInitialization, 'Golden trace must show initialized NODE values');
  assert.ok(hasListEndpoints, 'Golden trace must show pHead and pTail');
  assert.ok(hasTraversal, 'Golden trace must show pointer traversal and movement');
  assert.ok(hasUnlinking, 'Golden trace must show node unlinking');
  assert.ok(hasBeforeAfterDelete, 'Golden trace must show live memory before delete and freed memory afterward');
  assert.ok(hasFunctionCalls && hasFunctionReturns, 'Golden trace must show function calls and returns');
  assert.ok(hasStudentVisibleChanges, 'Golden trace must retain changes visible to the student');

  return {
    snapshots: trace.length,
    allocations: trace.filter(step => step.dsa.diff.allocatedNodes.length > 0).length,
    traversals: trace.filter(step => step.dsa.diff.pointerReroutes.some(change => change.pointer === 'p')).length,
    unlinkEvents: trace.filter(step => step.dsa.diff.unlinkedNodes.length > 0).length,
    deallocationEvents: trace.filter(step => step.dsa.diff.freedNodes.length > 0).length,
    calls: trace.filter(step => step.event === 'call').length,
    returns: trace.filter(step => step.event === 'return').length
  };
}

const TEST_CASES = [
  {
    id: 'TC-GOLDEN-01',
    name: 'IT003 TimKiemVaXoa chuẩn (Xóa 3 ở đầu và giữa: [3,0,8,2,3,4,7] -> [0,8,2,4,7])',
    code: BASE_GOLDEN_CODE,
    stdin: '7\n3 0 8 2 3 4 7\n3',
    expectedOutput: '0 8 2 4 7',
  },
  {
    id: 'TC-EDGE-01',
    name: 'Ca biên 1: Không tìm thấy k trong danh sách ([2,4,7], k=3 -> 2 4 7)',
    code: BASE_GOLDEN_CODE,
    stdin: '3\n2 4 7\n3',
    expectedOutput: '2 4 7',
  },
  {
    id: 'TC-EDGE-02',
    name: 'Ca biên 2: Xóa phần tử đầu danh sách ([3,0,8], k=3 -> 0 8)',
    code: BASE_GOLDEN_CODE,
    stdin: '3\n3 0 8\n3',
    expectedOutput: '0 8',
  },
  {
    id: 'TC-EDGE-03',
    name: 'Ca biên 3: Xóa phần tử cuối danh sách ([0,8,3], k=3 -> 0 8)',
    code: BASE_GOLDEN_CODE,
    stdin: '3\n0 8 3\n3',
    expectedOutput: '0 8',
  },
  {
    id: 'TC-EDGE-04',
    name: 'Ca biên 4: Xóa các nút trùng lặp liên tiếp ([3,3,4,3,3], k=3 -> 4)',
    code: BASE_GOLDEN_CODE,
    stdin: '5\n3 3 4 3 3\n3',
    expectedOutput: '4',
  },
  {
    id: 'TC-EDGE-05',
    name: 'Ca biên 5: Xóa toàn bộ danh sách ([3,3,3], k=3 -> -1)',
    code: BASE_GOLDEN_CODE,
    stdin: '3\n3 3 3\n3',
    expectedOutput: '-1',
  },
  {
    id: 'TC-EDGE-06',
    name: 'Ca biên 6: Danh sách rỗng ([] -> -1)',
    code: BASE_GOLDEN_CODE,
    stdin: '0\n3',
    expectedOutput: '-1',
  },
  {
    id: 'TC-EDGE-07',
    name: 'Ca biên 7: Danh sách có đúng 1 phần tử trùng khớp ([3], k=3 -> -1)',
    code: BASE_GOLDEN_CODE,
    stdin: '1\n3\n3',
    expectedOutput: '-1',
  },
  {
    id: 'TC-EDGE-08',
    name: 'Ca biên 8: Danh sách có đúng 1 phần tử không trùng ([7], k=3 -> 7)',
    code: BASE_GOLDEN_CODE,
    stdin: '1\n7\n3',
    expectedOutput: '7',
  },
  {
    id: 'TC-SEC-01',
    name: 'Bảo mật: Ngăn chặn mã độc #include <windows.h>',
    code: '#include <windows.h>\nint main() { return 0; }',
    stdin: '',
    shouldBlock: true,
  },
  {
    id: 'TC-SEC-02',
    name: 'Bảo mật: Ngăn chặn hàm thực thi hệ thống system()',
    code: '#include <cstdlib>\nint main() { system("calc"); return 0; }',
    stdin: '',
    shouldBlock: true,
  },
];

async function runTests() {
  console.log('='.repeat(70));
  console.log('🚀 DSA FlowLab: Full Automated Verification Suite');
  console.log('='.repeat(70));
  await runProcessTreeTests();

  // 1. Ensure backend server is ready
  let serverProcess = null;
  const isReady = await checkServerReady();
  if (!isReady) {
    console.log('Khởi động máy chủ backend tự động trên http://127.0.0.1:4000...');
    const serverPath = path.resolve(__dirname, '../server/dist/index.js');
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: '4000', HOST: '127.0.0.1' },
      silent: true
    });

    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkServerReady()) break;
    }
  }

  let passed = 0;
  let failed = 0;
  const results = [];
  let normalizerSummary = null;
  let invariantSummary = null;
  let clientAssertions = 0;
  let suiteFailures = 0;

  try {
    // -------------------------------------------------------------
    // Host header regression checks
    for (const tc of [
      { id: 'TC-SEC-HOST-LOCAL', host: 'localhost:4000', expected: 200 },
      { id: 'TC-SEC-HOST-LOOKALIKE', host: 'localhost.attacker.example:4000', expected: 403 },
    ]) {
      process.stdout.write(`Đang chạy [${tc.id}] Xác thực chính xác Host header (${tc.host})... `);
      try {
        const actual = await requestHealthWithHost(tc.host);
        if (actual === tc.expected) {
          console.log(`✅ PASS (HTTP ${actual})`);
          passed++;
          results.push({ id: tc.id, status: 'PASS' });
        } else {
          console.log(`❌ FAIL (Mong đợi HTTP ${tc.expected}, nhận HTTP ${actual})`);
          failed++;
          results.push({ id: tc.id, status: 'FAIL', expected: tc.expected, actual });
        }
      } catch (err) {
        console.log(`❌ ERROR (${err.message})`);
        failed++;
        results.push({ id: tc.id, status: 'ERROR', error: err.message });
      }
    }

    // PART 1: 13 baseline API execution test cases
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 1: 13 BÀI TOÁN CƠ SỞ (GOLDEN, EDGE CASES, SECURITY, STDIN) ---');
    for (const tc of TEST_CASES) {
      await new Promise((r) => setTimeout(r, 100));
      process.stdout.write(`Đang chạy [${tc.id}] ${tc.name}... `);

      try {
        const res = await callApiRun(tc.code, tc.stdin);

        if (tc.shouldBlock) {
          if (!res.success && res.buildOutput.includes('Bảo mật:')) {
            console.log('✅ PASS (Đã chặn an toàn)');
            passed++;
            results.push({ id: tc.id, status: 'PASS' });
          } else {
            console.log('❌ FAIL (Không chặn được mã nguy hiểm)');
            failed++;
            results.push({ id: tc.id, status: 'FAIL' });
          }
          continue;
        }

        if (!res.success) {
          console.log(`❌ FAIL (Biên dịch/chạy lỗi: ${res.buildOutput})`);
          failed++;
          results.push({ id: tc.id, status: 'FAIL', note: res.buildOutput });
          continue;
        }

        const actualOutput = readFinalOutput(res);

        if (actualOutput === tc.expectedOutput) {
          if (tc.id === 'TC-GOLDEN-01') {
            const completeness = assertTraceCompleteness(res.trace);
            console.log(`✅ PASS (Output: "${actualOutput}"; trace complete: ${JSON.stringify(completeness)})`);
          } else {
            console.log(`✅ PASS (Output: "${actualOutput}")`);
          }
          passed++;
          results.push({ id: tc.id, status: 'PASS' });
        } else {
          console.log(`❌ FAIL (Mong đợi: "${tc.expectedOutput}", Thực tế: "${actualOutput}")`);
          failed++;
          results.push({ id: tc.id, status: 'FAIL' });
        }
      } catch (err) {
        console.log(`❌ ERROR (${err.message})`);
        failed++;
        results.push({ id: tc.id, status: 'ERROR', error: err.message });
      }
    }

    // Stdin Differentiation Test
    process.stdout.write('Đang chạy [TC-STDIN-DIFF] Kiểm tra tính độc lập của stdin... ');
    try {
      const resA = await callApiRun(BASE_GOLDEN_CODE, '3\n1 2 3\n2');
      await new Promise((r) => setTimeout(r, 100));
      const resB = await callApiRun(BASE_GOLDEN_CODE, '3\n1 2 3\n1');

      const outA = readFinalOutput(resA);
      const outB = readFinalOutput(resB);

      if (resA.success && resB.success && outA !== outB && outA === '1 3' && outB === '2 3') {
        console.log(`✅ PASS (Input A -> "${outA}", Input B -> "${outB}")`);
        passed++;
        results.push({ id: 'TC-STDIN-DIFF', status: 'PASS' });
      } else {
        console.log(`❌ FAIL (outA="${outA}", outB="${outB}")`);
        failed++;
        results.push({ id: 'TC-STDIN-DIFF', status: 'FAIL' });
      }
    } catch (err) {
      console.log(`❌ ERROR (${err.message})`);
      failed++;
      results.push({ id: 'TC-STDIN-DIFF', status: 'ERROR', error: err.message });
    }

    // Stdout captured only after the inferior exits is explicitly final output;
    // it must not be copied onto a before-statement snapshot for the cout line.
    process.stdout.write('Đang chạy [TC-STDOUT-CHRONOLOGY] Kiểm tra cout không xuất hiện trước khi thực thi... ');
    try {
      const marker = 'FLOWLAB_CHRONOLOGY_MARKER';
      const code = `#include <iostream>\nint main() {\n  std::cout << "${marker}" << std::endl;\n  return 0;\n}`;
      const result = await callApiRun(code, '');
      const coutSnapshot = result.trace?.find(step => step.codeText.includes(marker));
      assert.ok(result.success, `Execution failed: ${result.buildOutput || 'unknown error'}`);
      assert.ok(coutSnapshot, 'Trace must contain the cout statement snapshot');
      assert.ok(!coutSnapshot.stdout.includes(marker), 'Before-statement snapshot must not contain output from its cout statement');
      assert.strictEqual(result.finalStdout.trim(), marker, 'Final output must preserve the program stdout');
      console.log('✅ PASS (cout absent before statement; final output retained separately)');
      passed++;
      results.push({ id: 'TC-STDOUT-CHRONOLOGY', status: 'PASS' });
    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
      results.push({ id: 'TC-STDOUT-CHRONOLOGY', status: 'FAIL', error: err.message });
    }

    // -------------------------------------------------------------
    // PART 2: DSA Normalizer & Pointer Classification Unit Tests
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: KIỂM THỬ ĐƠN VỊ BỘ CHUẨN HÓA & PHÂN LOẠI CON TRỎ ---');
    try {
      normalizerSummary = runNormalizerUnitTests();
    } catch (err) {
      normalizerSummary = err.summary || { passed: 0, failed: 1, total: 1 };
      suiteFailures++;
      console.error(`Normalizer suite failed: ${err.message}`);
    }

    // -------------------------------------------------------------
    // PART 3: 21 Memory Invariant & Pointer Topology Tests
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: 17 BẤT BIẾN BỘ NHỚ & TOPO CON TRỎ (MEMORY INVARIANTS) ---');
    try {
      invariantSummary = await runMemoryInvariantTests();
    } catch (err) {
      invariantSummary = err.summary || { passed: 0, failed: 1, total: 1, clientTestExecutions: 0 };
      suiteFailures++;
      console.error(`Memory invariant suite failed: ${err.message}`);
    }

    console.log('\n' + '='.repeat(70));
    clientAssertions = invariantSummary?.clientTestExecutions || 0;
    const backendExecutions = passed + failed + (normalizerSummary?.total || 0) + (invariantSummary?.total || 0);
    const executions = backendExecutions + clientAssertions;
    const uniqueAssertions = backendExecutions + clientAssertions;
    const overallFailed = failed + (normalizerSummary?.failed || 0) + (invariantSummary?.failed || 0);
    console.log(`🏁 TỔNG KẾT (${overallFailed ? 'FAIL' : 'PASS'}): ${passed}/${passed + failed} baseline; ${normalizerSummary?.passed || 0}/${normalizerSummary?.total || 0} normalizer; ${invariantSummary?.passed || 0}/${invariantSummary?.total || 0} invariants; ${clientAssertions} client assertions via MI-12.`);
    console.log(`Test executions this command: ${executions}; unique assertions: ${uniqueAssertions}. MI-12 ran the ${clientAssertions} client assertions once inside this command.`);
    console.log('='.repeat(70));
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  if (failed > 0 || suiteFailures > 0 || (normalizerSummary?.failed || 0) > 0 || (invariantSummary?.failed || 0) > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
