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
    const shellOpt = process.platform === 'win32' ? { shell: 'powershell.exe' } : {};
    const vitestOutput = execSync('npm test', { cwd: clientDir, encoding: 'utf-8', ...shellOpt });
    assert.ok(vitestOutput.includes('passed'), 'Vitest UI suite must pass');
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
    const resTaken = await runCppCode(code, '1');
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

    // Branch NOT taken: flag=0 → delete skipped → output 77
    const resSkipped = await runCppCode(code, '0');
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
