// Direct GDB runner verification for Program A and Program B
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { runCppCode } = require('../server/dist/runner/cppRunner');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer');

const PROGRAM_A = `#include <iostream>
using namespace std;

int main() {
    int a[5] = {5, 2, 8, 1, 9};
    int temp = a[0];
    a[0] = a[1];
    a[1] = temp;
    cout << a[0] << " " << a[1];
    return 0;
}
`;

const PROGRAM_B = `#include <iostream>
using namespace std;

void swapFirstTwo(int a[]) {
    int temp = a[0];
    a[0] = a[1];
    a[1] = temp;
}

int main() {
    int a[3] = {8, 2, 5};
    swapFirstTwo(a);
    for (int i = 0; i < 3; i++)
        cout << a[i] << " ";
}
`;

async function main() {
  console.log('======================================================================');
  console.log('🔬 Verifying Program A & Program B with Real Native GDB Backend');
  console.log('======================================================================');

  // --- PROGRAM A ---
  console.log('\n--- Running Program A (Array Mutation) ---');
  const resA = await runCppCode(PROGRAM_A, '');
  assert.strictEqual(resA.success, true, 'Program A must compile and run successfully');
  assert.strictEqual(resA.finalStdout.trim(), '2 5', 'Program A stdout must be "2 5"');
  console.log(`✅ Program A executed: stdout="${resA.finalStdout.trim()}", totalSteps=${resA.trace.length}`);

  const normA = normalizeTrace(resA.trace);
  assert.ok(normA.length > 0, 'Program A must produce normalized trace');

  // Step 0: Line 5 (int a[5] = ...)
  const step0 = normA[0];
  assert.strictEqual(step0.line, 5, 'Step 0 must be line 5');
  console.log(`✅ Step 0: line=${step0.line}, codeText="${step0.codeText.trim()}"`);

  // Verify step 1 has initialized [5, 2, 8, 1, 9]
  const step1 = normA[1];
  const arrLocals1 = step1.stackToRender[0].encodedLocals.a;
  assert.ok(Array.isArray(arrLocals1) && arrLocals1[0] === 'C_ARRAY', 'Local a must be C_ARRAY');
  const arrVals1 = arrLocals1.slice(2).map(x => x[3]);
  assert.deepStrictEqual(arrVals1, [5, 2, 8, 1, 9], 'Step 1 must have initialized array [5, 2, 8, 1, 9]');
  console.log(`✅ Step 1: line=${step1.line}, array initialized: [${arrVals1.join(', ')}]`);

  // Verify mutation steps
  const stepBeforeSwap1 = normA.find(s => s.codeText && s.codeText.includes('a[0] = a[1]'));
  const stepBeforeSwap2 = normA.find(s => s.codeText && s.codeText.includes('a[1] = temp'));
  const stepReturn = normA.find(s => s.codeText && s.codeText.includes('return 0'));

  const valsBeforeSwap2 = stepBeforeSwap2.stackToRender[0].encodedLocals.a.slice(2).map(x => x[3]);
  assert.strictEqual(valsBeforeSwap2[0], 2, 'a[0] must become 2 after a[0] = a[1]');
  console.log(`✅ Step before swap2: line=${stepBeforeSwap2.line}, a[0]=${valsBeforeSwap2[0]} (mutated 5 -> 2)`);

  const valsFinal = stepReturn.stackToRender[0].encodedLocals.a.slice(2).map(x => x[3]);
  assert.deepStrictEqual(valsFinal, [2, 5, 8, 1, 9], 'Final array state must be [2, 5, 8, 1, 9]');
  console.log(`✅ Step return: final array state = [${valsFinal.join(', ')}]`);

  // --- PROGRAM B ---
  console.log('\n--- Running Program B (Helper-Function Pointer Decay) ---');
  const resB = await runCppCode(PROGRAM_B, '');
  assert.strictEqual(resB.success, true, 'Program B must compile and run successfully');
  assert.strictEqual(resB.finalStdout.trim(), '2 8 5', 'Program B stdout must be "2 8 5"');
  console.log(`✅ Program B executed: stdout="${resB.finalStdout.trim()}", totalSteps=${resB.trace.length}`);

  const normB = normalizeTrace(resB.trace);

  // Find step inside swapFirstTwo
  const stepInsideCallee = normB.find(s => s.funcName === 'swapFirstTwo');
  assert.ok(stepInsideCallee, 'Must have steps inside swapFirstTwo callee');
  assert.ok(stepInsideCallee.stackToRender.length >= 2, 'Must have at least 2 stack frames in callee');

  const calleeFrame = stepInsideCallee.stackToRender.find(f => f.funcName === 'swapFirstTwo');
  const callerFrame = stepInsideCallee.stackToRender.find(f => f.funcName === 'main');
  assert.ok(calleeFrame, 'Must have swapFirstTwo frame');
  assert.ok(callerFrame, 'Must have main frame');

  // Verify caller has C_ARRAY 'a'
  const callerA = callerFrame.encodedLocals.a;
  assert.ok(Array.isArray(callerA) && callerA[0] === 'C_ARRAY', 'Caller main must own C_ARRAY a');
  const callerAddr = callerA[1];

  // Verify callee has decayed pointer 'a' pointing to caller's array address
  const calleeA = calleeFrame.encodedLocals.a;
  assert.ok(Array.isArray(calleeA) && calleeA[0] === 'C_DATA', 'Callee a must be C_DATA (pointer)');
  assert.strictEqual(calleeA[2], 'pointer', 'Callee a must have type pointer');
  assert.strictEqual(calleeA[3], callerAddr, `Callee a target (${calleeA[3]}) must match caller a address (${callerAddr})`);
  console.log(`✅ Callee decayed pointer: targetAddress=${calleeA[3]} matches caller array address=${callerAddr}`);

  // Verify final array state after callee returns
  const stepLoopB = normB.find(s => s.funcName === 'main' && s.codeText && s.codeText.includes('for (int i = 0'));
  assert.ok(stepLoopB, 'Must find loop step in main after swap');
  const finalValsB = stepLoopB.stackToRender[0].encodedLocals.a.slice(2).map(x => x[3]);
  assert.deepStrictEqual(finalValsB, [2, 8, 5], 'Array after swapFirstTwo must be [2, 8, 5]');
  console.log(`✅ Caller array mutated by callee: [${finalValsB.join(', ')}]`);

  console.log('\n======================================================================');
  console.log('🎉 Both Program A and Program B verified with real GDB backend: PASS');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
