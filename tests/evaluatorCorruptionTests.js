/**
 * Tests for Evaluator Integrity & Adversarial Corruption Detection
 * 
 * Verifies that tests/runEvaluationM2_3.js detects and rejects:
 * 1. Wrong old/new values in state diffs
 * 2. Wrong frame identities (frame collision / scope confusion)
 * 3. Inverted before-statement timing (claiming pending mutations occurred early)
 * 4. Missing required checkpoints (yielding UNKNOWN, not silent skip)
 * 5. Wrong source line numbers
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { runCppCode } = require(path.join(ROOT, 'server/dist/runner/cppRunner'));
const { normalizeTrace } = require(path.join(ROOT, 'server/dist/normalizer/dsaNormalizer'));
const { gradeCheckpoint, CHECKPOINT_REGISTRY } = require(path.join(ROOT, 'tests/runEvaluationM2_3'));

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function runCorruptionTests() {
  console.log('='.repeat(70));
  console.log('🧪 Running Evaluator Corruption & Adversarial Integrity Tests');
  console.log('='.repeat(70));

  // 1. Prepare valid traces for Fixtures A, B, and H
  const codeA = fs.readFileSync(path.join(ROOT, 'tests/fixtures/m2_3/A_binary_search.cpp'), 'utf8');
  const resA = await runCppCode(codeA, '');
  const traceA = normalizeTrace(resA.trace);

  const codeB = fs.readFileSync(path.join(ROOT, 'tests/fixtures/m2_3/B_prefix_sums.cpp'), 'utf8');
  const resB = await runCppCode(codeB, '');
  const traceB = normalizeTrace(resB.trace);

  const codeH = fs.readFileSync(path.join(ROOT, 'tests/fixtures/m2_3/H_shadow_pointers.cpp'), 'utf8');
  const resH = await runCppCode(codeH, '');
  const traceH = normalizeTrace(resH.trace);

  console.log('  Base fixtures compiled and normalized successfully.');

  let testsPassed = 0;

  // -------------------------------------------------------------------------
  // CORRUPTION TEST 1: Wrong old/new value
  // -------------------------------------------------------------------------
  {
    console.log('\n--- Corruption Test 1: Wrong old/new value detection ---');
    const cpB2 = CHECKPOINT_REGISTRY.find(cp => cp.id === 'CP-B2');
    assert.ok(cpB2, 'CP-B2 must exist in registry');

    // Baseline: uncorrupted trace passes as CORRECT
    const baseResult = gradeCheckpoint(cpB2, traceB, codeB);
    assert.strictEqual(baseResult.verdict, 'CORRECT', 'Uncorrupted CP-B2 must be CORRECT');

    // Corrupt trace: change diff from (0 -> 3) to (999 -> 999)
    const corruptedTraceB = deepClone(traceB);
    const step4 = corruptedTraceB[4]; // Step where diff is observed
    assert.ok(step4, 'Step 4 must exist');
    const update = step4.dsa.diff.arrayUpdates.find(u => u.arrayName === 'cumSum' && u.index === 1);
    assert.ok(update, 'cumSum[1] update must exist');
    update.from = 999;
    update.to = 999;

    const corruptedResult = gradeCheckpoint(cpB2, corruptedTraceB, codeB);
    assert.notStrictEqual(corruptedResult.verdict, 'CORRECT', 'Corrupted value must NOT be graded CORRECT');
    assert.strictEqual(corruptedResult.verdict, 'PARTIAL', 'Missing valid (0 -> 3) transition must be caught');
    console.log(`  ✅ Corruption 1 Detected: verdict was degraded to ${corruptedResult.verdict} (${corruptedResult.reason})`);
    testsPassed++;
  }

  // -------------------------------------------------------------------------
  // CORRUPTION TEST 2: Wrong frame identity (caller/callee collision)
  // -------------------------------------------------------------------------
  {
    console.log('\n--- Corruption Test 2: Wrong frame identity detection ---');
    const cpH2 = CHECKPOINT_REGISTRY.find(cp => cp.id === 'CP-H2');
    assert.ok(cpH2, 'CP-H2 must exist in registry');

    // Baseline: uncorrupted trace passes as CORRECT
    const baseResult = gradeCheckpoint(cpH2, traceH, codeH);
    assert.strictEqual(baseResult.verdict, 'CORRECT', 'Uncorrupted CP-H2 must be CORRECT');

    // Corrupt trace: force mainFrame and outerFrame to share the exact same frameId
    const corruptedTraceH = deepClone(traceH);
    const step2 = corruptedTraceH[2]; // processOuter entry
    assert.ok(step2, 'Step 2 must exist');
    for (const f of step2.stackToRender) {
      f.frameId = '0xCOLLISION_SAME_ID';
    }

    const corruptedResult = gradeCheckpoint(cpH2, corruptedTraceH, codeH);
    assert.strictEqual(corruptedResult.verdict, 'WRONG', 'Frame collision must be graded WRONG');
    assert.ok(corruptedResult.reason.includes('Failed to isolate caller main and callee processOuter'),
      'Reason must specifically flag frame isolation failure');
    console.log(`  ✅ Corruption 2 Detected: verdict was flagged as WRONG (${corruptedResult.reason})`);
    testsPassed++;
  }

  // -------------------------------------------------------------------------
  // CORRUPTION TEST 3: Inverted before-statement timing
  // -------------------------------------------------------------------------
  {
    console.log('\n--- Corruption Test 3: Inverted before-statement timing detection ---');
    const cpA1 = CHECKPOINT_REGISTRY.find(cp => cp.id === 'CP-A1');
    assert.ok(cpA1, 'CP-A1 must exist in registry');

    // Baseline: uncorrupted trace passes as CORRECT
    const baseResult = gradeCheckpoint(cpA1, traceA, codeA);
    assert.strictEqual(baseResult.verdict, 'CORRECT', 'Uncorrupted CP-A1 must be CORRECT');

    // Corrupt trace: inject array updates into step 0 itself (violating before-statement convention)
    const corruptedTraceA = deepClone(traceA);
    corruptedTraceA[0].dsa.diff.arrayUpdates = [
      { arrayName: 'seq', index: 0, from: '?', to: 2 }
    ];

    const corruptedResult = gradeCheckpoint(cpA1, corruptedTraceA, codeA);
    assert.strictEqual(corruptedResult.verdict, 'WRONG', 'Early mutation before statement must be graded WRONG');
    assert.ok(corruptedResult.reason.includes('before-statement'), 'Reason must specifically flag before-statement violation');
    console.log(`  ✅ Corruption 3 Detected: verdict was flagged as WRONG (${corruptedResult.reason})`);
    testsPassed++;
  }

  // -------------------------------------------------------------------------
  // CORRUPTION TEST 4: Missing required checkpoint
  // -------------------------------------------------------------------------
  {
    console.log('\n--- Corruption Test 4: Missing required checkpoint detection ---');
    const cpA5 = CHECKPOINT_REGISTRY.find(cp => cp.id === 'CP-A5');
    assert.ok(cpA5, 'CP-A5 must exist in registry');

    // Baseline: uncorrupted trace passes as CORRECT
    const baseResult = gradeCheckpoint(cpA5, traceA, codeA);
    assert.strictEqual(baseResult.verdict, 'CORRECT', 'Uncorrupted CP-A5 must be CORRECT');

    // Corrupt trace: truncate trace to 3 steps (step 9 where high is adjusted is missing)
    const truncatedTraceA = traceA.slice(0, 3);

    const corruptedResult = gradeCheckpoint(cpA5, truncatedTraceA, codeA);
    assert.strictEqual(corruptedResult.verdict, 'UNKNOWN', 'Missing checkpoint step must be graded UNKNOWN');
    assert.ok(corruptedResult.reason.includes('Cannot find'), 'Reason must indicate checkpoint could not be found');
    console.log(`  ✅ Corruption 4 Detected: verdict was flagged as UNKNOWN (${corruptedResult.reason})`);
    testsPassed++;
  }

  // -------------------------------------------------------------------------
  // CORRUPTION TEST 5: Wrong source line
  // -------------------------------------------------------------------------
  {
    console.log('\n--- Corruption Test 5: Wrong source line detection ---');
    const cpB1 = CHECKPOINT_REGISTRY.find(cp => cp.id === 'CP-B1');
    assert.ok(cpB1, 'CP-B1 must exist in registry');

    // Baseline: uncorrupted trace passes as CORRECT
    const baseResult = gradeCheckpoint(cpB1, traceB, codeB);
    assert.strictEqual(baseResult.verdict, 'CORRECT', 'Uncorrupted CP-B1 must be CORRECT');

    // Corrupt trace: change line number of step 1 from 6 to 999
    const corruptedTraceB = deepClone(traceB);
    corruptedTraceB[1].line = 999;

    const corruptedResult = gradeCheckpoint(cpB1, corruptedTraceB, codeB);
    assert.strictEqual(corruptedResult.verdict, 'UNKNOWN', 'Step with mismatched line must be rejected as UNKNOWN');
    console.log(`  ✅ Corruption 5 Detected: verdict was flagged as UNKNOWN (${corruptedResult.reason})`);
    testsPassed++;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${testsPassed}/5 ADVERSARIAL CORRUPTION CHECKS PASSED!`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  runCorruptionTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Corruption test failed:', err);
    process.exit(1);
  });
}

module.exports = { runCorruptionTests };
