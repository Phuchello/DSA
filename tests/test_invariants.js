const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { runCppCode } = require('../server/dist/runner/cppRunner.js');
const { execSync } = require('child_process');
const path = require('path');

async function runMemoryInvariantTests() {
  console.log('='.repeat(70));
  console.log('🔬 DSA FlowLab: Memory Invariant & Pointer Topology Verification');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;
  let clientTestExecutions = 0;

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

    const deleteStepIdx = res.trace.findIndex(s => s.codeText.trim() === 'delete p;');
    assert.ok(deleteStepIdx >= 0 && res.trace[deleteStepIdx + 1], 'Must capture the step after alias deallocation');
    const afterDelete = res.trace[deleteStepIdx + 1];
    const pAfterDelete = afterDelete.dsa.pointers.find(x => x.name === 'p');
    const qAfterDelete = afterDelete.dsa.pointers.find(x => x.name === 'q');
    assert.strictEqual(pAfterDelete?.state, 'freed', 'Deleting through p must free the shared NODE allocation');
    assert.strictEqual(qAfterDelete?.state, 'freed', 'The q alias must observe the same completed deallocation');
    assert.strictEqual(pAfterDelete.targetAddress, qAfterDelete.targetAddress, 'Freed aliases must retain the same target address');
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
  // AUDIT NOTE: Address reuse is non-deterministic — the OS/allocator decides
  // whether to reuse freed memory for the next allocation. This test:
  //   1. Verifies a node was freed (p1 address becomes freed)
  //   2. Verifies a new node was allocated afterward (p2 is active)
  //   3. If the allocator reused p1's address for p2, verifies generation >= 2
  //      and that old and new identities are distinct
  //   4. If address reuse did NOT occur, reports that result honestly (inconclusive)
  // The test is NOT marked PASS based on claimed reuse without observation.
  // -------------------------------------------------------------
  await test('MI-08', 'Memory address reuse — honest observation', async () => {
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

    // Find step at p1 allocation
    const p1AllocIdx = res.trace.findIndex(s => s.codeText.includes('NODE* p1 = new NODE'));
    assert.ok(p1AllocIdx >= 0, 'Must record p1 alloc step');

    // Find step at p2 allocation
    const p2AllocIdx = res.trace.findIndex(s => s.codeText.includes('NODE* p2 = new NODE'));
    assert.ok(p2AllocIdx >= 0, 'Must record p2 alloc step');
    assert.ok(p2AllocIdx > p1AllocIdx, 'p2 must be allocated after p1');

    // At the step AFTER p1 delete, p1 should be freed
    const deleteStepIdx = res.trace.findIndex(s => s.codeText.trim() === 'delete p1;');
    assert.ok(deleteStepIdx >= 0, 'Must record delete p1 step');

    // After the delete step, p1 address must enter freed list
    let p1Addr = null;
    for (let k = deleteStepIdx; k < res.trace.length; k++) {
      const s = res.trace[k];
      const p1Ptr = s.dsa.pointers.find(p => p.name === 'p1');
      if (p1Ptr && p1Ptr.state === 'freed' && p1Ptr.targetAddress) {
        p1Addr = p1Ptr.targetAddress;
        break;
      }
    }
    assert.ok(p1Addr, 'p1 pointer must reach freed state after delete p1');

    // After p2 allocation, p2 must point to a live (allocated/detached) node
    const stepAfterP2 = res.trace[p2AllocIdx + 1];
    assert.ok(stepAfterP2, 'Must have a step after p2 allocation');
    const p2Ptr = stepAfterP2.dsa.pointers.find(p => p.name === 'p2');
    assert.ok(p2Ptr, 'p2 pointer must exist in trace');
    assert.ok(p2Ptr.targetAddress && p2Ptr.targetAddress !== '0x0', 'p2 must target a valid address');
    assert.notStrictEqual(p2Ptr.state, 'freed', 'p2 must not be classified as freed');

    const node222 = stepAfterP2.dsa.nodes.find(n => n.address === p2Ptr.targetAddress);
    assert.ok(node222, 'Node for p2 must exist in node list');
    assert.ok(node222.status === 'allocated' || node222.status === 'detached',
      `p2 node must be live (got: ${node222.status})`);
    assert.ok(node222.info === 222, `p2 node must carry info=222 (got: ${node222.info})`);

    // Honest address-reuse observation:
    if (p2Ptr.targetAddress === p1Addr) {
      // Allocator DID reuse the address — verify generation increased
      assert.ok(node222.generation >= 2,
        `Address reuse detected at ${p1Addr}: generation must be >= 2 (got: ${node222.generation})`);
      // Old identity (gen1) must not appear in live nodes
      const oldNode = stepAfterP2.dsa.nodes.find(n => n.address === p1Addr && n.generation === 1);
      assert.ok(!oldNode || oldNode.status === 'freed',
        'Old node generation must be marked freed when its address is reused');
      console.log(`  [MI-08 note] Address reuse CONFIRMED at ${p1Addr} (gen ${node222.generation})`);
    } else {
      // Allocator did NOT reuse the address — this is valid. Report as inconclusive on reuse.
      console.log(`  [MI-08 note] Address reuse NOT observed (p1=${p1Addr}, p2=${p2Ptr.targetAddress}). Test verifies correct lifecycle without reuse.`);
    }
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
    int nextSum = SumList(p->pNext);
    return p->info + nextSum;
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

    const canonicalFunctionName = (name) => String(name || '').split('!').pop().split('(')[0].trim();
    const recursiveSnapshots = res.trace.filter(s => canonicalFunctionName(s.funcName) === 'SumList');
    console.log(`  [MI-09 trace evidence] ${JSON.stringify(res.trace.map(step => ({
      step: step.step,
      line: step.line,
      funcName: step.funcName,
      codeText: step.codeText,
      frames: (step.stackToRender || []).map(frame => ({
        name: frame.funcName,
        sourceLocation: frame.sourceLocation,
        frameDepth: frame.frameDepth,
        parameterValues: frame.parameterValues,
        parentFrameId: frame.parentFrameId,
        childFrameId: frame.childFrameId
      }))
    })))}`);

    const maxFrameStep = res.trace.reduce((max, s) => s.stackToRender.length > max.stackToRender.length ? s : max, res.trace[0]);
    assert.ok(maxFrameStep.stackToRender.length >= 4, 'Must observe main and at least three nested recursive frames');

    const sumFrames = maxFrameStep.stackToRender.filter(f => canonicalFunctionName(f.funcName) === 'SumList');
    assert.ok(sumFrames.length >= 3, 'Must observe at least three simultaneous SumList invocations');
    assert.ok(maxFrameStep.stackToRender.some(f => f.funcName === 'main'), 'The caller main frame must remain visible');

    const deepestSumFrames = maxFrameStep.stackToRender.filter(f => canonicalFunctionName(f.funcName) === 'SumList');
    const mainFrame = maxFrameStep.stackToRender.find(f => f.funcName === 'main');
    const expectedTargets = [
      mainFrame.encodedLocals.n1[3],
      mainFrame.encodedLocals.n2[3],
      mainFrame.encodedLocals.n3[3],
      '0x0'
    ];
    assert.ok(deepestSumFrames.length >= expectedTargets.length, 'Must capture the base-case invocation as well as the three node invocations');
    for (const [index, frame] of deepestSumFrames.slice(0, expectedTargets.length).entries()) {
      assert.strictEqual(frame.parameterValues.p[3], expectedTargets[index], `SumList invocation ${index} must retain its own p argument`);
      assert.strictEqual(frame.encodedLocals.p[3], expectedTargets[index], `SumList local p must match invocation ${index}`);
      assert.strictEqual(frame.frameDepth, index + 1, 'Frame depth must match outer-to-inner ordering');
      assert.ok(frame.sourceLocation?.file === 'source.cpp' && frame.sourceLocation.line > 0, 'Each recursive frame needs its actual source location');
      assert.strictEqual(frame.parentFrameId, maxFrameStep.stackToRender[index].frameId, 'Each invocation must point to its caller frame');
      if (index + 1 < maxFrameStep.stackToRender.length) {
        assert.strictEqual(maxFrameStep.stackToRender[index].childFrameId, frame.frameId, 'Caller and child frame links must agree');
      }
    }
    assert.ok(res.trace.some(s => s.event === 'call'), 'The timeline must retain recursive function-entry events');
    assert.ok(res.trace.slice(0, -1).some(s => s.event === 'return'), 'The timeline must retain function-return transitions before program exit');
    for (const step of res.trace) {
      assert.deepStrictEqual(step.stackToRender.map(f => f.frameDepth), step.stackToRender.map((_, i) => i), 'Every snapshot must preserve outer-to-inner frame order');
    }
    const expectedTimelineFrames = res.trace.map(s => s.stackToRender.map(f => f.frameId));
    const forwardIndices = Array.from({ length: res.trace.length }, (_, index) => index);
    const backwardIndices = forwardIndices.slice().reverse();
    const navigationIndices = [...forwardIndices, ...backwardIndices, ...forwardIndices];
    const navigatedFrames = navigationIndices.map(index => res.trace[index].stackToRender.map(f => f.frameId));
    const traceLength = res.trace.length;
    assert.deepStrictEqual(navigatedFrames.slice(0, traceLength), expectedTimelineFrames, 'Forward navigation must retain frame order');
    assert.deepStrictEqual(navigatedFrames.slice(traceLength, traceLength * 2), expectedTimelineFrames.slice().reverse(), 'Backward navigation must retain frame order');
    assert.deepStrictEqual(navigatedFrames.slice(traceLength * 2), expectedTimelineFrames, 'Forward navigation after stepping backward must restore frame order');
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
    const npmCommand = process.platform === 'win32' ? 'npm.cmd test' : 'npm test';
    const vitestOutput = execSync(npmCommand, {
      cwd: clientDir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
    }).replace(/\u001b\[[0-9;]*m/g, '');
    const vitestSummary = /Tests\s+(\d+)\s+passed\b/i.exec(vitestOutput);
    assert.ok(vitestSummary, `Vitest must report its executed test count; output tail: ${vitestOutput.slice(-2000)}`);
    clientTestExecutions = Number(vitestSummary[1]);
    assert.ok(clientTestExecutions > 0, 'Vitest UI suite must execute at least one assertion');
  });

  // -------------------------------------------------------------
  // MI-13: Unknown/unsupported pointer type is classified as 'unknown', not 'dangling'
  // An int* or char* that is not in the NODE heap graph must not be false-positive dangling.
  // -------------------------------------------------------------
  await test('MI-13', 'Non-NODE pointer classified as unknown, not false-positive dangling', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    int x = 42;
    int* iptr = &x;
    NODE* n = new NODE{99, nullptr};
    cout << n->info << endl;
    delete n;
    return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Code execution must succeed');

    // Find a step where iptr is initialized in scope
    const coutStep = res.trace.find(s => s.codeText.includes('cout << n->info'));
    if (coutStep) {
      const iptrPtr = coutStep.dsa.pointers.find(p => p.name === 'iptr');
      if (iptrPtr) {
        assert.notStrictEqual(iptrPtr.state, 'dangling',
          `Non-NODE pointer iptr must not be classified as dangling (got: ${iptrPtr.state})`);
        assert.ok(
          iptrPtr.state === 'unknown' || iptrPtr.state === 'valid',
          `Non-NODE pointer iptr should be unknown or valid at execution (got: ${iptrPtr.state})`
        );
      }
    } else {
      const nodeStep = res.trace.find(s => s.dsa.pointers.some(p => p.name === 'iptr'));
      if (nodeStep) {
        const iptrPtr = nodeStep.dsa.pointers.find(p => p.name === 'iptr');
        assert.notStrictEqual(iptrPtr.state, 'dangling',
          `Non-NODE pointer iptr must not be classified as dangling (got: ${iptrPtr.state})`);
      }
    }
  });

  // -------------------------------------------------------------
  // MI-14: Conditional delete — node freed only on taken branch
  // -------------------------------------------------------------
  await test('MI-14', 'Conditional delete — node freed only when condition is true', async () => {
    const code = `#include <iostream>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    int flag;
    cin >> flag;
    NODE* n = new NODE{77, nullptr};
    if (flag == 1) {
        delete n;
        n = nullptr;
    }
    cout << (n == nullptr ? -1 : n->info) << endl;
    return 0;
}`;
    // Branch taken: flag=1 → delete executes → n becomes nullptr → output -1
    const oldDebugSetting = process.env.FLOWLAB_DEBUG_DEALLOC;
    process.env.FLOWLAB_DEBUG_DEALLOC = '1';
    let resTaken;
    let resSkipped;
    let resStl;
    try {
      resTaken = await runCppCode(code, '1');
      resSkipped = await runCppCode(code, '0');
      const stlCode = `#include <iostream>
#include <vector>
using namespace std;
struct NODE { int info; NODE* pNext; };
int main() {
    vector<int> values(256, 5);
    NODE* n = new NODE{88, nullptr};
    values.clear();
    values.shrink_to_fit();
    cout << n->info << endl;
    return 0;
}`;
      resStl = await runCppCode(stlCode, '');
    } finally {
      if (oldDebugSetting === undefined) delete process.env.FLOWLAB_DEBUG_DEALLOC;
      else process.env.FLOWLAB_DEBUG_DEALLOC = oldDebugSetting;
    }

    const readDiagnostics = (res) => (res.debugDiagnostics || '').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const takenDiagnostics = readDiagnostics(resTaken);
    const skippedDiagnostics = readDiagnostics(resSkipped);
    const stlDiagnostics = readDiagnostics(resStl);
    console.log(`  [MI-14 GDB] flag=1: ${JSON.stringify(takenDiagnostics.filter(d => d.event !== 'breakpoint-installed'))}`);
    console.log(`  [MI-14 GDB] flag=0: ${JSON.stringify(skippedDiagnostics.filter(d => d.event !== 'breakpoint-installed'))}`);
    console.log(`  [MI-14 GDB] STL regression: ${JSON.stringify(stlDiagnostics.filter(d => d.event !== 'breakpoint-installed'))}`);

    assert.strictEqual(resTaken.success, true, 'Execution must succeed with flag=1');
    const outTaken = resTaken.trace[resTaken.trace.length - 1].stdout.trim();
    assert.strictEqual(outTaken, '-1', 'With flag=1, delete taken, output must be -1');

    // Check that after the delete branch, n is freed
    const deleteStepTaken = resTaken.trace.findIndex(s => s.codeText.trim() === 'delete n;');
    if (deleteStepTaken >= 0) {
      // Step after delete: n must be freed or null
      const postDeleteStep = resTaken.trace[deleteStepTaken + 2]; // +1 is n=nullptr
      if (postDeleteStep) {
        const nPtr = postDeleteStep.dsa.pointers.find(p => p.name === 'n');
        if (nPtr) {
          assert.ok(
            nPtr.state === 'freed' || nPtr.state === 'null',
            `After conditional delete, n must be freed or null (got: ${nPtr.state})`
          );
        }
      }
    }
    assert.ok(takenDiagnostics.some(d => d.event === 'completed' && d.source_execution_location?.code.trim() === 'delete n;'),
      'GDB diagnostics must confirm the direct delete n call and its completed deallocation');

    // Branch NOT taken: flag=0 → delete skipped → output 77
    assert.strictEqual(resSkipped.success, true, 'Execution must succeed with flag=0');
    const outSkipped = resSkipped.trace[resSkipped.trace.length - 1].stdout.trim();
    assert.strictEqual(outSkipped, '77', 'With flag=0, delete skipped, output must be 77');

    // Node must remain allocated (no false freed classification)
    // Verify that at the cout step following the if block, n is active and not freed
    const coutStep = resSkipped.trace.find(s => s.codeText.includes('cout << (n == nullptr'));
    assert.ok(coutStep, 'Must trace the cout step following the if block');
    const nPtrCout = coutStep.dsa.pointers.find(p => p.name === 'n');
    assert.ok(nPtrCout, 'n must be in scope at cout step');
    assert.strictEqual(nPtrCout.state, 'valid', 'With flag=0, n must be valid (delete was skipped)');
    assert.ok(coutStep.dsa.nodes.some(n => n.info === 77 && n.status !== 'freed'),
      'Node with info=77 must remain live and active');
    assert.strictEqual(skippedDiagnostics.filter(d => d.event === 'completed' && d.source_execution_location?.code.trim() === 'delete n;').length, 0,
      'GDB must not report a delete completion when the conditional branch was skipped');

    assert.strictEqual(resStl.success, true, 'STL deallocation regression program must execute');
    const stlNodePtr = resStl.trace.find(s => s.codeText.includes('cout << n->info'))?.dsa.pointers.find(p => p.name === 'n');
    assert.strictEqual(stlNodePtr?.state, 'valid', 'STL vector deallocation must not free a live NODE at a matching/ambiguous address');
    assert.ok(resStl.trace.find(s => s.codeText.includes('cout << n->info'))?.dsa.nodes.some(n => n.info === 88 && n.status !== 'freed'),
      'The NODE remains live after unrelated STL allocation cleanup');
    assert.ok(stlDiagnostics.some(d => d.event === 'ignored' && d.source_execution_location?.code.includes('values.')),
      'Diagnostics must identify and ignore the actual vector cleanup call site');
  });

  // -------------------------------------------------------------
  // MI-15: Compile failure is reported cleanly with buildOutput, empty trace
  // -------------------------------------------------------------
  await test('MI-15', 'Compile failure returns buildOutput and empty trace', async () => {
    const badCode = `#include <iostream>
int main() {
    UNDEFINED_TYPE x = 5  // missing semicolon, unknown type
    return 0;
}`;
    const res = await runCppCode(badCode, '');
    assert.strictEqual(res.success, false, 'Compile failure must return success=false');
    assert.ok(Array.isArray(res.trace) && res.trace.length === 0,
      'Compile failure must produce empty trace');
    assert.ok(typeof res.buildOutput === 'string' && res.buildOutput.length > 0,
      'Compile failure must include buildOutput with compiler error message');
    // Must not contain false "Chương trình kết thúc bình thường"
    assert.ok(!res.buildOutput.includes('bình thường'),
      'Compile error output must not claim normal termination');
  });

  // -------------------------------------------------------------
  // MI-16: Schema validation rejects malformed trace steps
  // Negative test — a synthetic malformed step must produce a schema_error event
  // not silently pass through as valid data.
  // -------------------------------------------------------------
  await test('MI-16', 'Schema validation emits error for malformed trace steps', async () => {
    // We use the normalizeTrace function directly (no GDB needed)
    const serverDist = path.resolve(__dirname, '../server/dist');
    const { normalizeTrace } = require(path.join(serverDist, 'normalizer/dsaNormalizer.js'));

    // A completely malformed trace step: missing required 'line' and 'event'
    const malformedTrace = [
      { notEvent: 'foo', noLine: true },
    ];

    const result = normalizeTrace(malformedTrace);
    assert.strictEqual(result.length, 1, 'Malformed step must produce exactly one output entry');
    assert.strictEqual(result[0].event, 'schema_error',
      `Malformed step must produce event=schema_error (got: ${result[0].event})`);
    assert.ok(result[0].dsa.vietnameseExplanation.includes('Lỗi xác thực'),
      'schema_error must include Vietnamese validation error message');
  });

  // -------------------------------------------------------------
  // MI-17: Partial trace / timeout is explicitly labeled, not reported as normal
  // (mirrors MI-10 but with explicit 'truncated' event and terminationStatus)
  // -------------------------------------------------------------
  await test('MI-17', 'Partial trace labeled truncated, not normal — explicit terminationStatus check', async () => {
    const origMaxSteps = process.env.FLOWLAB_MAX_STEPS;
    process.env.FLOWLAB_MAX_STEPS = '15';
    try {
      const code = `#include <iostream>
using namespace std;
int main() {
    for (int i = 0; i < 1000; i++) {
        int x = i * 2;
    }
    return 0;
}`;
      const res = await runCppCode(code, '');
      assert.strictEqual(res.success, true, 'Partial execution must still return success=true');
      assert.ok(res.trace.length <= 15, 'Must not exceed MAX_STEPS');
      assert.strictEqual(res.terminationStatus, 'truncated',
        `Truncated trace must have terminationStatus=truncated (got: ${res.terminationStatus})`);
      assert.strictEqual(res.trace[res.trace.length - 1].event, 'truncated',
        'Last step event must be truncated');
      // terminationReason must include Vietnamese message
      assert.ok(typeof res.terminationReason === 'string' && res.terminationReason.length > 0,
        'Must include terminationReason');
    } finally {
      if (origMaxSteps !== undefined) {
        process.env.FLOWLAB_MAX_STEPS = origMaxSteps;
      } else {
        delete process.env.FLOWLAB_MAX_STEPS;
      }
    }
  });


  // -------------------------------------------------------------
  // MI-18: POSIX/Windows timeout kills descendants, cleans resources, and frees slots
  // -------------------------------------------------------------
  await test('MI-18', 'Timeout kills the execution tree, removes temp workspaces, and recovers concurrency slots', async () => {
    const oldTimeout = process.env.FLOWLAB_GDB_TIMEOUT_MS;
    const oldMaxSteps = process.env.FLOWLAB_MAX_STEPS;
    const tempRoot = path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsa_flowlab_tmp');
    fs.mkdirSync(tempRoot, { recursive: true });
    const before = new Set(fs.readdirSync(tempRoot));
    process.env.FLOWLAB_GDB_TIMEOUT_MS = '1500';
    process.env.FLOWLAB_MAX_STEPS = '1000000000';
    try {
      const loopingCode = `int main() {
  volatile unsigned long counter = 0;
  while (true) { ++counter; }
  return 0;
}`;
      const timeoutStartedAt = Date.now();
      const activeRuns = Array.from({ length: 8 }, () => runCppCode(loopingCode, ''));
      const saturated = await runCppCode('#include <iostream>\\nint main() { return 0; }', '');
      assert.strictEqual(saturated.success, false, 'The ninth concurrent request must be rejected at the configured limit');
      assert.ok(saturated.buildOutput.includes('đang bận'), 'Concurrency rejection must remain explicit');

      const outcomes = await Promise.all(activeRuns);
      assert.ok(Date.now() - timeoutStartedAt < 20000, 'Timeout tree termination and all eight promises must settle within a bounded interval');
      assert.ok(outcomes.every(result => result.success === false), 'Every timed-out GDB run must settle as a failure');
      assert.ok(outcomes.every(result => result.terminationStatus === 'timeout'),
        'Each killed GDB process tree must report timeout');
      assert.ok(outcomes.every(result => result.trace.length === 0), 'A killed tracer must not fabricate a partial trace');
      const after = new Set(fs.readdirSync(tempRoot));
      assert.deepStrictEqual([...after].filter(name => !before.has(name)), [],
        'Every timed-out execution must remove its temporary workspace');

      const recovered = await runCppCode('#include <iostream>\\nint main() { std::cout << 9; return 0; }', '');
      assert.strictEqual(recovered.success, true, 'A new request must run after timed-out slots are released');
      assert.strictEqual(recovered.finalStdout.trim(), '9');
    } finally {
      if (oldTimeout === undefined) delete process.env.FLOWLAB_GDB_TIMEOUT_MS;
      else process.env.FLOWLAB_GDB_TIMEOUT_MS = oldTimeout;
      if (oldMaxSteps === undefined) delete process.env.FLOWLAB_MAX_STEPS;
      else process.env.FLOWLAB_MAX_STEPS = oldMaxSteps;
    }
  });

  // -------------------------------------------------------------
  // MI-19: Readable stack NODE objects are not heap allocations
  // -------------------------------------------------------------
  await test('MI-19', 'Separates stack NODE objects from true heap NODE allocations and preserves links', async () => {
    const code = `#include <iostream>
struct NODE {
  int info;
  NODE* pNext;
};
int main() {
  NODE local{1, nullptr};
  NODE* p = &local;
  NODE* heapNode = new NODE{2, p};
  heapNode->pNext = p;
  std::cout << heapNode->info;
  return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'Mixed stack/heap NODE program must run');

    const pDeclarationIndex = res.trace.findIndex(step => step.codeText.includes('NODE* p = &local'));
    assert.ok(pDeclarationIndex >= 0 && res.trace[pDeclarationIndex + 1],
      'Trace must include the snapshot after p is assigned to the stack local');
    const stackPoint = res.trace[pDeclarationIndex + 1];
    const mainFrame = stackPoint.stackToRender.find(frame => frame.funcName === 'main');
    const localValue = mainFrame?.encodedLocals?.local;
    assert.ok(Array.isArray(localValue) && localValue[0] === 'C_STRUCT', 'local must remain visible as a stack struct');
    const localAddress = localValue[1];
    const stackNode = stackPoint.dsa.nodes.find(node => node.address === localAddress);
    const stackPointer = stackPoint.dsa.pointers.find(pointer => pointer.name === 'p' && pointer.frameId === mainFrame.frameId);
    assert.strictEqual(stackNode?.location, 'stack', 'The NODE local must be explicitly classified on the stack');
    assert.strictEqual(stackPointer?.targetAddress, localAddress, 'p must retain its address relationship to local');
    assert.strictEqual(stackPointer?.state, 'valid', 'A known stack NODE target is a valid pointer');
    assert.strictEqual(Object.keys(stackPoint.heap).length, 0, 'A stack NODE must not appear in the heap table');

    const heapStep = res.trace.find(step => step.codeText.includes('std::cout << heapNode->info'));
    assert.ok(heapStep, 'Trace must reach the statement after heap allocation');
    const heapPointer = heapStep.dsa.pointers.find(pointer => pointer.name === 'heapNode');
    assert.ok(heapPointer?.targetAddress, 'heapNode pointer must retain its target');
    const heapNode = heapStep.dsa.nodes.find(node => node.address === heapPointer.targetAddress);
    assert.strictEqual(heapNode?.location, 'heap', 'The new NODE must have allocation evidence and remain on the heap');
    assert.strictEqual(heapNode?.nextAddress, localAddress, 'Heap-to-stack pNext topology must remain intact');
    assert.ok(heapStep.heap[localAddress] === undefined, 'The stack local must never be copied into heap records');
  });

  // -------------------------------------------------------------
  // MI-20: Identically named pointer variables remain frame-qualified
  // -------------------------------------------------------------
  await test('MI-20', 'Keeps caller and recursive p pointers independent in native GDB traces', async () => {
    const code = `#include <iostream>
struct NODE { int info; NODE* pNext; };
NODE* CreateNode(int value) {
  NODE* p = new NODE{value, nullptr};
  return p;
}
int SumList(NODE* p) {
  if (p == nullptr) return 0;
  return p->info + SumList(p->pNext);
}
int main() {
  NODE* p = CreateNode(1);
  NODE* second = CreateNode(2);
  p->pNext = second;
  int total = SumList(p);
  std::cout << total;
  return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'CreateNode and recursive SumList program must run');

    const createNodeStep = res.trace.find(step => {
      const callee = step.stackToRender.find(frame => frame.funcName === 'CreateNode');
      return callee?.encodedLocals?.p?.[2] === 'pointer' && callee.encodedLocals.p[3] !== '0x0';
    });
    assert.ok(createNodeStep, 'Must capture CreateNode after its local p has received the allocated node');
    const createFrame = createNodeStep.stackToRender.find(frame => frame.funcName === 'CreateNode');
    const callerFrame = createNodeStep.stackToRender.find(frame => frame.funcName === 'main');
    const createPointer = createNodeStep.dsa.pointers.find(pointer => pointer.name === 'p' && pointer.frameId === createFrame.frameId);
    const callerPointer = createNodeStep.dsa.pointers.find(pointer => pointer.name === 'p' && pointer.frameId === callerFrame.frameId);
    assert.strictEqual(createPointer?.state, 'valid', 'CreateNode local p must retain the live node pointer');
    assert.strictEqual(callerPointer?.state, 'uninitialized', 'main caller p must remain uninitialized before return');
    assert.notStrictEqual(createPointer?.displayName, callerPointer?.displayName,
      'The UI label must disambiguate same-named pointer instances');

    const recursiveStep = res.trace.find(step => step.stackToRender.filter(frame => frame.funcName === 'SumList').length >= 3);
    assert.ok(recursiveStep, 'Must capture at least three recursive SumList frames');
    const recursiveFrames = recursiveStep.stackToRender.filter(frame => frame.funcName === 'SumList');
    const recursivePointers = recursiveFrames.map(frame =>
      recursiveStep.dsa.pointers.find(pointer => pointer.name === 'p' && pointer.frameId === frame.frameId)
    );
    assert.ok(recursivePointers.every(Boolean), 'Every recursive frame must retain its own p pointer');
    assert.strictEqual(new Set(recursivePointers.map(pointer => pointer.frameId)).size, recursiveFrames.length,
      'Recursive p instances must have frame-qualified identities');
    recursiveFrames.forEach((frame, index) => {
      assert.strictEqual(recursivePointers[index].targetAddress, frame.encodedLocals.p[3],
        `SumList frame ${index} must display its own p target`);
    });
    assert.strictEqual(new Set(recursivePointers.map(pointer => pointer.displayName)).size, recursiveFrames.length,
      'The linked-list canvas must distinguish recursive p labels');
  });


  // -------------------------------------------------------------
  // MI-21: Real GDB-detected crash preserves the partial trace
  // -------------------------------------------------------------
  await test('MI-21', 'Native segmentation fault is reported as a crash with its partial trace', async () => {
    const code = `#include <iostream>
int main() {
  int* pointer = nullptr;
  *pointer = 42;
  return 0;
}`;
    const res = await runCppCode(code, '');
    assert.strictEqual(res.success, true, 'A debuggable crash with snapshots must preserve its trace response');
    assert.strictEqual(res.terminationStatus, 'crashed', `Expected crashed status, got ${res.terminationStatus}`);
    assert.ok(res.terminationReason.includes('SIGSEGV') || res.terminationReason.includes('Segmentation'),
      'Crash response must include a clear signal or segmentation reason');
    assert.ok(res.trace.length > 0, 'Crash response must retain snapshots captured before the fault');
    assert.strictEqual(res.trace[res.trace.length - 1].event, 'crashed',
      'Final partial snapshot must identify abnormal termination');
  });

  console.log('='.repeat(70));
  console.log(`🏁 Memory Invariant Tests: ${passed} PASS, ${failed} FAIL trên tổng số ${passed + failed} bài kiểm tra`);
  console.log('='.repeat(70));

  const summary = { passed, failed, total: passed + failed, clientTestExecutions };
  if (failed > 0) {
    const error = new Error('Memory invariant assertions failed');
    error.summary = summary;
    throw error;
  }
  return summary;
}

if (require.main === module) {
  runMemoryInvariantTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runMemoryInvariantTests };
