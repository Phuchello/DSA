const assert = require('assert');
const { runCppCode } = require('../server/dist/runner/cppRunner.js');
const { execSync } = require('child_process');
const path = require('path');

async function runMemoryInvariantTests() {
  console.log('='.repeat(70));
  console.log('🔬 DSA FlowLab: Memory Invariant & Pointer Topology Verification');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  async function test(id, name, fn) {
    process.stdout.write(`Đang kiểm tra [${id}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log(`❌ FAIL: ${err.message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // MI-01: Correct pHead before and after head deletion
  // -------------------------------------------------------------
  await test('MI-01', 'Correct pHead before and after head deletion', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
struct LIST { NODE* pHead; NODE* pTail; };
int main() {
    NODE* n3 = new NODE{30, nullptr};
    NODE* n2 = new NODE{20, n3};
    NODE* n1 = new NODE{10, n2};
    LIST L{n1, n3};
    NODE* temp = L.pHead;
    L.pHead = L.pHead->pNext;
    delete temp;
    cout << L.pHead->info << endl;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const shiftStepIdx = res.trace.findIndex(s => s.codeText.includes('L.pHead = L.pHead->pNext'));
    assert.ok(shiftStepIdx >= 0, 'Must record step at head shift statement');

    const beforeShift = res.trace[shiftStepIdx];
    const afterShift = res.trace[shiftStepIdx + 1];

    const pHeadBefore = beforeShift.dsa.pointers.find(p => p.name === 'L.pHead');
    const pHeadAfter = afterShift.dsa.pointers.find(p => p.name === 'L.pHead');

    assert.ok(pHeadBefore && pHeadAfter, 'pHead pointer must exist in both steps');
    assert.notStrictEqual(pHeadBefore.targetAddress, pHeadAfter.targetAddress, 'pHead target must change after shift');

    // Before shift: pHead points to node with info 10
    const node10 = beforeShift.dsa.nodes.find(n => n.address === pHeadBefore.targetAddress);
    assert.ok(node10 && node10.info === 10, 'Pre-shift pHead must reference node with info=10');

    // After shift: pHead points to node with info 20
    const node20 = afterShift.dsa.nodes.find(n => n.address === pHeadAfter.targetAddress);
    assert.ok(node20 && node20.info === 20, 'Post-shift pHead must reference node with info=20');
  });

  // -------------------------------------------------------------
  // MI-02: Correct pTail after tail deletion
  // -------------------------------------------------------------
  await test('MI-02', 'Correct pTail after tail deletion', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
struct LIST { NODE* pHead; NODE* pTail; };
int main() {
    NODE* n3 = new NODE{30, nullptr};
    NODE* n2 = new NODE{20, n3};
    NODE* n1 = new NODE{10, n2};
    LIST L{n1, n3};
    NODE* prev = n2;
    NODE* temp = L.pTail;
    prev->pNext = nullptr;
    L.pTail = prev;
    delete temp;
    cout << L.pTail->info << endl;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const tailShiftStepIdx = res.trace.findIndex(s => s.codeText.includes('L.pTail = prev'));
    assert.ok(tailShiftStepIdx >= 0, 'Must record step at tail shift statement');

    const beforeShift = res.trace[tailShiftStepIdx];
    const afterShift = res.trace[tailShiftStepIdx + 1];

    const pTailBefore = beforeShift.dsa.pointers.find(p => p.name === 'L.pTail');
    const pTailAfter = afterShift.dsa.pointers.find(p => p.name === 'L.pTail');

    assert.ok(pTailBefore && pTailAfter, 'pTail pointer must exist in both steps');
    assert.notStrictEqual(pTailBefore.targetAddress, pTailAfter.targetAddress, 'pTail target must change');

    // New tail node (info 20) must have nextAddress == null
    const newTailNode = afterShift.dsa.nodes.find(n => n.address === pTailAfter.targetAddress);
    assert.ok(newTailNode && newTailNode.info === 20, 'New tail node must have info=20');
    assert.strictEqual(newTailNode.nextAddress, null, 'New tail node must point to nullptr');
  });

  // -------------------------------------------------------------
  // MI-03: Correct pNext target before and after middle-node unlinking
  // -------------------------------------------------------------
  await test('MI-03', 'Correct pNext target before and after middle-node unlinking', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
struct LIST { NODE* pHead; NODE* pTail; };
int main() {
    NODE* n3 = new NODE{30, nullptr};
    NODE* n2 = new NODE{20, n3};
    NODE* n1 = new NODE{10, n2};
    LIST L{n1, n3};
    NODE* prev = n1;
    NODE* p = n2;
    prev->pNext = p->pNext;
    delete p;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const unlinkStepIdx = res.trace.findIndex(s => s.codeText.includes('prev->pNext = p->pNext'));
    assert.ok(unlinkStepIdx >= 0, 'Must record step at unlink statement');

    const beforeUnlink = res.trace[unlinkStepIdx];
    const afterUnlink = res.trace[unlinkStepIdx + 1];

    const prevNodeBefore = beforeUnlink.dsa.nodes.find(n => n.info === 10);
    const prevNodeAfter = afterUnlink.dsa.nodes.find(n => n.info === 10);

    const node20 = beforeUnlink.dsa.nodes.find(n => n.info === 20);
    const node30 = beforeUnlink.dsa.nodes.find(n => n.info === 30);

    assert.ok(prevNodeBefore && prevNodeAfter && node20 && node30, 'Nodes must exist');
    assert.strictEqual(prevNodeBefore.nextAddress, node20.address, 'Before unlink, prev points to middle node 20');
    assert.strictEqual(prevNodeAfter.nextAddress, node30.address, 'After unlink, prev points to node 30 directly');
  });

  // -------------------------------------------------------------
  // MI-04: Precise pre-delete versus post-delete memory state
  // -------------------------------------------------------------
  await test('MI-04', 'Precise pre-delete versus post-delete memory state', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    NODE* temp = new NODE{77, nullptr};
    delete temp;
    temp = nullptr;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const deleteStepIdx = res.trace.findIndex(s => s.codeText.includes('delete temp'));
    assert.ok(deleteStepIdx >= 0, 'Must record step at delete statement');

    const preDeleteStep = res.trace[deleteStepIdx];
    const postDeleteStep = res.trace[deleteStepIdx + 1];

    const tempPtrPre = preDeleteStep.dsa.pointers.find(p => p.name === 'temp');
    assert.ok(tempPtrPre && tempPtrPre.targetAddress, 'temp must hold valid target address at delete step');
    const targetAddr = tempPtrPre.targetAddress;

    // PRE-DELETE: targetAddr must NOT be freed yet
    const preFreed = preDeleteStep.dsa.freedNodes.map(n => n.address);
    assert.ok(!preFreed.includes(targetAddr), 'Node must NOT be marked freed before delete executes');

    // POST-DELETE: targetAddr must now be in freedNodes
    const postFreed = postDeleteStep.dsa.freedNodes.map(n => n.address);
    assert.ok(postFreed.includes(targetAddr), 'Node MUST be marked freed in the step following delete');
    assert.ok(postDeleteStep.dsa.diff.freedNodes.includes(targetAddr), 'Diff must report freedNodes on deallocation step');
  });

  // -------------------------------------------------------------
  // MI-05: Two aliases pointing to one node
  // -------------------------------------------------------------
  await test('MI-05', 'Two aliases pointing to one node', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    NODE* p = new NODE{99, nullptr};
    NODE* q = p;
    cout << p->info << " " << q->info << endl;
    delete p;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const aliasStepIdx = res.trace.findIndex(s => s.codeText.includes('NODE* q = p'));
    assert.ok(aliasStepIdx >= 0, 'Must record alias statement step');

    const stepAfterAlias = res.trace[aliasStepIdx + 1];
    const pPtr = stepAfterAlias.dsa.pointers.find(x => x.name === 'p');
    const qPtr = stepAfterAlias.dsa.pointers.find(x => x.name === 'q');

    assert.ok(pPtr && qPtr, 'Both alias pointers p and q must exist');
    assert.strictEqual(pPtr.targetAddress, qPtr.targetAddress, 'Both pointers must reference identical address');

    const sharedNode = stepAfterAlias.dsa.nodes.find(n => n.address === pPtr.targetAddress);
    assert.ok(sharedNode && sharedNode.info === 99, 'Shared node must hold info=99');
  });

  // -------------------------------------------------------------
  // MI-06: Dangling pointer after deallocation
  // -------------------------------------------------------------
  await test('MI-06', 'Dangling pointer after deallocation', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    NODE* p = new NODE{55, nullptr};
    delete p;
    int keepAlive = 42;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const keepAliveStepIdx = res.trace.findIndex(s => s.codeText.includes('int keepAlive = 42'));
    assert.ok(keepAliveStepIdx >= 0, 'Must record step after delete');

    const stepAfterDel = res.trace[keepAliveStepIdx];
    const pPtr = stepAfterDel.dsa.pointers.find(x => x.name === 'p');

    assert.ok(pPtr, 'Pointer p must still exist on stack frame');
    assert.ok(pPtr.targetAddress && pPtr.targetAddress !== '0x0', 'Dangling pointer p must retain old hex address');
    assert.strictEqual(pPtr.state, 'freed', 'Pointer state must be classified as freed/dangling');

    const freedNode = stepAfterDel.dsa.freedNodes.find(n => n.address === pPtr.targetAddress);
    assert.ok(freedNode, 'Target node must be in freedNodes list');
  });

  // -------------------------------------------------------------
  // MI-07: Detached node still reachable through another valid pointer
  // -------------------------------------------------------------
  await test('MI-07', 'Detached node still reachable through another valid pointer', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
struct LIST { NODE* pHead; NODE* pTail; };
int main() {
    NODE* n3 = new NODE{30, nullptr};
    NODE* n2 = new NODE{20, n3};
    NODE* n1 = new NODE{10, n2};
    LIST L{n1, n3};
    NODE* prev = n1;
    NODE* p = n2;
    prev->pNext = p->pNext;
    int inFlightCheck = 1;
    delete p;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const inFlightStepIdx = res.trace.findIndex(s => s.codeText.includes('int inFlightCheck = 1'));
    assert.ok(inFlightStepIdx >= 0, 'Must record inFlight check step');

    const step = res.trace[inFlightStepIdx];
    const pPtr = step.dsa.pointers.find(x => x.name === 'p');
    assert.ok(pPtr, 'p pointer must exist');

    // Node 20 is detached from main list, but reached via p
    const detached20 = step.dsa.detachedNodes.find(n => n.info === 20);
    assert.ok(detached20, 'Unlinked node 20 held by p must be categorized as detached');
    assert.strictEqual(detached20.status, 'detached', 'Status must be detached, not unreachable');

    // Must NOT be in main chain
    const inMain = step.dsa.mainChain.some(n => n.info === 20);
    assert.strictEqual(inMain, false, 'Unlinked node 20 must NOT be in mainChain');
  });

  // -------------------------------------------------------------
  // MI-08: Memory address reuse
  // -------------------------------------------------------------
  await test('MI-08', 'Memory address reuse', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    NODE* p1 = new NODE{111, nullptr};
    delete p1;
    NODE* p2 = new NODE{222, nullptr};
    cout << p2->info << endl;
    delete p2;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const p2AllocStepIdx = res.trace.findIndex(s => s.codeText.includes('NODE* p2 = new NODE'));
    assert.ok(p2AllocStepIdx >= 0, 'Must record p2 alloc step');

    const stepAfterP2 = res.trace[p2AllocStepIdx + 1];
    const p2Ptr = stepAfterP2.dsa.pointers.find(p => p.name === 'p2');
    assert.ok(p2Ptr, 'p2 pointer must exist');

    const node222 = stepAfterP2.dsa.nodes.find(n => n.address === p2Ptr.targetAddress);
    assert.ok(node222, 'Active node for p2 must exist');
    assert.ok(
      node222.status === 'allocated' || node222.status === 'detached',
      'Reused or newly allocated node must be active (allocated or detached), never freed'
    );
    assert.notStrictEqual(node222.status, 'freed', 'Reused node must not remain marked as freed');
  });

  // -------------------------------------------------------------
  // MI-09: Multiple stack frames and recursion
  // -------------------------------------------------------------
  await test('MI-09', 'Multiple stack frames and recursion', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int SumList(NODE* p) {
    if (p == nullptr) return 0;
    return p->info + SumList(p->pNext);
}
int main() {
    NODE* n3 = new NODE{3, nullptr};
    NODE* n2 = new NODE{2, n3};
    NODE* n1 = new NODE{1, n2};
    int res = SumList(n1);
    cout << res << endl;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    const maxFrameStep = res.trace.reduce((max, s) => s.stackToRender.length > max.stackToRender.length ? s : max, res.trace[0]);
    assert.ok(maxFrameStep.stackToRender.length >= 3, 'Must observe at least 3 nested stack frames during recursion');

    const sumFrames = maxFrameStep.stackToRender.filter(f => f.funcName === 'SumList');
    assert.ok(sumFrames.length >= 2, 'Must observe multiple SumList stack frames');
  });

  // -------------------------------------------------------------
  // MI-10: Trace truncation and abnormal termination
  // -------------------------------------------------------------
  await test('MI-10', 'Trace truncation and abnormal termination', async () => {
    process.env.FLOWLAB_MAX_STEPS = '30';
    try {
      const loopCode = `#include <iostream>
using namespace std;
int main() {
    int sum = 0;
    for (int i = 0; i < 100; i++) {
        sum += i;
    }
    cout << sum << endl;
    return 0;
}`;
      const resTrunc = await runCppCode(loopCode, '');
      assert.strictEqual(resTrunc.success, true, 'Code execution should succeed up to truncation');
      assert.strictEqual(resTrunc.totalSteps, 30, 'Truncated trace must stop at MAX_STEPS');
      assert.strictEqual(resTrunc.terminationStatus, 'truncated', 'Must report truncated termination status');
      assert.strictEqual(resTrunc.trace[resTrunc.trace.length - 1].event, 'truncated', 'Last step event must be truncated');
    } finally {
      delete process.env.FLOWLAB_MAX_STEPS;
    }
  });

  // -------------------------------------------------------------
  // MI-11: Different stdin inputs using unchanged source code
  // -------------------------------------------------------------
  await test('MI-11', 'Different stdin inputs using unchanged source code', async () => {
    const code = `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << (a + b) << endl;
    return 0;
}`;
    const resA = await runCppCode(code, '10 20');
    const resB = await runCppCode(code, '35 45');

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);

    const outA = resA.trace[resA.trace.length - 1].stdout.trim();
    const outB = resB.trace[resB.trace.length - 1].stdout.trim();

    assert.strictEqual(outA, '30', 'Input 10 20 must produce 30');
    assert.strictEqual(outB, '80', 'Input 35 45 must produce 80');
    assert.notStrictEqual(outA, outB, 'Outputs must be independent and distinct');
  });

  // -------------------------------------------------------------
  // MI-12: Browser editor input, output, and timeline consistency
  // -------------------------------------------------------------
  await test('MI-12', 'Browser editor input, output, and timeline consistency', async () => {
    // Run the Vitest client tests
    const clientDir = path.resolve(__dirname, '../client');
    const vitestOutput = execSync('npm test', { cwd: clientDir, encoding: 'utf-8' });
    assert.ok(vitestOutput.includes('passed'), 'Vitest UI suite must pass');
  });

  console.log('='.repeat(70));
  console.log(`🏁 Memory Invariant Tests: ${passed} PASS, ${failed} FAIL trên tổng số ${passed + failed} bài kiểm tra`);
  console.log('='.repeat(70));

  if (failed > 0) throw new Error('Memory invariant assertions failed');
}

if (require.main === module) {
  runMemoryInvariantTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runMemoryInvariantTests };
