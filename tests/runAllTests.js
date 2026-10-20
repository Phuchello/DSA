const http = require('http');

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
        hostname: 'localhost',
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
  console.log('🚀 DSA FlowLab: Automated Test Suite Execution');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const tc of TEST_CASES) {
    await new Promise(r => setTimeout(r, 200));
    process.stdout.write(`Đang chạy [${tc.id}] ${tc.name}... `);

    try {
      const res = await callApiRun(tc.code, tc.stdin);

      if (tc.shouldBlock) {
        if (!res.success && res.buildOutput.includes('Bảo mật:')) {
          console.log('✅ PASS (Đã chặn an toàn)');
          passed++;
          results.push({ id: tc.id, status: 'PASS', note: 'Blocked malicious pattern' });
        } else {
          console.log('❌ FAIL (Không chặn được mã nguy hiểm)');
          failed++;
          results.push({ id: tc.id, status: 'FAIL', note: 'Failed to block forbidden code' });
        }
        continue;
      }

      if (!res.success) {
        console.log(`❌ FAIL (Biên dịch/chạy lỗi: ${res.buildOutput})`);
        failed++;
        results.push({ id: tc.id, status: 'FAIL', note: res.buildOutput });
        continue;
      }

      let actualOutput = '';
      for (let i = res.trace.length - 1; i >= 0; i--) {
        if (res.trace[i]?.stdout && res.trace[i].stdout.trim()) {
          actualOutput = res.trace[i].stdout.trim();
          break;
        }
      }

      if (actualOutput === tc.expectedOutput) {
        console.log(`✅ PASS (Output: "${actualOutput}", Steps: ${res.totalSteps})`);
        passed++;
        results.push({
          id: tc.id,
          status: 'PASS',
          actualOutput,
          expectedOutput: tc.expectedOutput,
          steps: res.totalSteps,
        });
      } else {
        console.log(`❌ FAIL (Mong đợi: "${tc.expectedOutput}", Thực tế: "${actualOutput}", Success: ${res.success}, TraceLen: ${res.trace ? res.trace.length : 0})`);
        failed++;
        results.push({
          id: tc.id,
          status: 'FAIL',
          actualOutput,
          expectedOutput: tc.expectedOutput,
        });
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
    await new Promise(r => setTimeout(r, 200));
    const resB = await callApiRun(BASE_GOLDEN_CODE, '3\n1 2 3\n1');

    let outA = '';
    if (resA && resA.trace) {
      for (let i = resA.trace.length - 1; i >= 0; i--) {
        if (resA.trace[i]?.stdout && resA.trace[i].stdout.trim()) {
          outA = resA.trace[i].stdout.trim();
          break;
        }
      }
    }

    let outB = '';
    if (resB && resB.trace) {
      for (let i = resB.trace.length - 1; i >= 0; i--) {
        if (resB.trace[i]?.stdout && resB.trace[i].stdout.trim()) {
          outB = resB.trace[i].stdout.trim();
          break;
        }
      }
    }

    if (resA.success && resB.success && outA !== outB && outA === '1 3' && outB === '2 3') {
      console.log(`✅ PASS (Input A -> "${outA}", Input B -> "${outB}")`);
      passed++;
      results.push({ id: 'TC-STDIN-DIFF', status: 'PASS', note: 'Outputs distinct and correct' });
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

  console.log('='.repeat(70));
  console.log(`🏁 Tổng kết: ${passed} PASS, ${failed} FAIL trên tổng số ${passed + failed} bài kiểm tra`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
