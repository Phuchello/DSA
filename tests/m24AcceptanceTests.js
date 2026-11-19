const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runCppCode } = require('../server/dist/runner/cppRunner');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'm2_4');
const ARTIFACT_PATH = process.env.M24_ARTIFACT_JSON ||
  path.join(__dirname, '..', 'docs', 'eval_results', 'm2_4_acceptance_results.json');

const FORBIDDEN_BEFORE_STATEMENT_PHRASES = [
  'đã thực hiện xong',
  'đã được cập nhật',
  'đã cập nhật xong',
  'đã hoàn thành',
  'đã gán xong',
  'đã tính toán xong',
  'đã thay đổi xong',
  'đã được gán',
  'đã kết thúc',
  'đã giải phóng xong',
  'đã cấp phát xong',
  'already completed',
  'already updated',
  'has been updated',
];

function checkBeforeStatementTiming(step) {
  assert.strictEqual(step.snapshotConvention, 'before-statement', `Step ${step.step}: must be before-statement`);
  const { upcoming, semantics } = step.dsa.explanationDetail;
  for (const kw of FORBIDDEN_BEFORE_STATEMENT_PHRASES) {
    assert.ok(!upcoming.toLowerCase().includes(kw), `Step ${step.step}: upcoming leaked completed phrase "${kw}"`);
    assert.ok(!semantics.toLowerCase().includes(kw), `Step ${step.step}: semantics leaked completed phrase "${kw}"`);
  }
}

async function runM24AcceptanceTests() {
  console.log('\n🔬 Running M2.4 Real Native C++/GDB Educational Acceptance Suite...');

  // -------------------------------------------------------------------------
  // Fixture 1: 01_window_bound_scan.cpp
  // -------------------------------------------------------------------------
  const f1Path = path.join(FIXTURES_DIR, '01_window_bound_scan.cpp');
  const f1Code = fs.readFileSync(f1Path, 'utf8');
  const f1Res = await runCppCode(f1Code, '');
  assert.ok(f1Res.success, `Fixture 01 execution failed: ${f1Res.buildOutput}`);
  assert.strictEqual((f1Res.finalStdout || '').trim(), '1 10 2', 'Fixture 01 stdout mismatch');

  const f1Trace = normalizeTrace(f1Res.trace);
  f1Trace.forEach(checkBeforeStatementTiming);

  const clampFalseStep = f1Trace.find(s => s.funcName === 'clampProbe' && s.codeText.includes('if (loBound > hiBound)'));
  assert.ok(clampFalseStep, 'Missing if (loBound > hiBound) step');
  assert.ok(
    clampFalseStep.dsa.explanationDetail.semantics.includes('loBound = 1, hiBound = 2') &&
    clampFalseStep.dsa.explanationDetail.semantics.includes('1 > 2') &&
    clampFalseStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `clampProbe shadowed check must use callee (1, 2), not main (10, 2). Got: ${clampFalseStep.dsa.explanationDetail.semantics}`
  );

  const whileSteps = f1Trace.filter(s => s.funcName === 'clampProbe' && s.codeText.includes('while (loBound < hiBound)'));
  assert.ok(whileSteps.length >= 2, `Expected >=2 while evaluations in clampProbe, got ${whileSteps.length}`);
  assert.ok(
    whileSteps[0].dsa.explanationDetail.semantics.includes('1 < 2') &&
    whileSteps[0].dsa.explanationDetail.semantics.includes('Đúng (true)'),
    `First while check must be 1 < 2 -> true, got: ${whileSteps[0].dsa.explanationDetail.semantics}`
  );
  const lastWhile = whileSteps[whileSteps.length - 1];
  assert.ok(
    lastWhile.dsa.explanationDetail.semantics.includes('1 < 1') &&
    lastWhile.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `Exit while check must be 1 < 1 -> false, got: ${lastWhile.dsa.explanationDetail.semantics}`
  );

  const eqCheckStep = f1Trace.find(s => s.funcName === 'clampProbe' && s.codeText.includes('if (probeVal == loBound)'));
  assert.ok(eqCheckStep, 'Missing if (probeVal == loBound) step');
  assert.ok(
    eqCheckStep.dsa.explanationDetail.semantics.includes('2 == 1') &&
    eqCheckStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `probeVal == loBound must be 2 == 1 -> false, got: ${eqCheckStep.dsa.explanationDetail.semantics}`
  );

  const compoundElseIfStep = f1Trace.find(s => s.funcName === 'clampProbe' && s.codeText.includes('else if (probeVal < hiBound && loBound >= 0)'));
  assert.ok(compoundElseIfStep, 'Missing compound else-if step');
  assert.ok(
    compoundElseIfStep.dsa.explanationDetail.semantics.includes('phức hợp') &&
    !compoundElseIfStep.dsa.explanationDetail.semantics.includes('Đúng (true)') &&
    !compoundElseIfStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `Compound && condition must stay honestly generic, got: ${compoundElseIfStep.dsa.explanationDetail.semantics}`
  );

  console.log(`  ✅ Fixture 01 (01_window_bound_scan.cpp): ${f1Trace.length} steps, stdout="1 10 2"`);

  // -------------------------------------------------------------------------
  // Fixture 2: 02_bool_flag_countdown.cpp
  // -------------------------------------------------------------------------
  const f2Path = path.join(FIXTURES_DIR, '02_bool_flag_countdown.cpp');
  const f2Code = fs.readFileSync(f2Path, 'utf8');
  const f2Res = await runCppCode(f2Code, '');
  assert.ok(f2Res.success, `Fixture 02 execution failed: ${f2Res.buildOutput}`);
  assert.strictEqual((f2Res.finalStdout || '').trim(), '2', 'Fixture 02 stdout mismatch');

  const f2Trace = normalizeTrace(f2Res.trace);
  f2Trace.forEach(checkBeforeStatementTiming);

  const negBoolStep = f2Trace.find(s => s.funcName === 'stepCountdown' && s.codeText.includes('if (!isArmed)'));
  assert.ok(negBoolStep, 'Missing if (!isArmed) step');
  assert.ok(
    negBoolStep.dsa.explanationDetail.semantics.includes('isArmed = true') &&
    negBoolStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `!isArmed with isArmed=true must be false, got: ${negBoolStep.dsa.explanationDetail.semantics}`
  );

  const countdownWhiles = f2Trace.filter(s => s.funcName === 'stepCountdown' && s.codeText.includes('while (remCount > 0)'));
  assert.ok(countdownWhiles.length >= 3, `Expected >=3 while(remCount > 0) checks, got ${countdownWhiles.length}`);
  assert.ok(
    countdownWhiles[0].dsa.explanationDetail.semantics.includes('2 > 0') &&
    countdownWhiles[0].dsa.explanationDetail.semantics.includes('Đúng (true)'),
    `Entry while must be 2 > 0 -> true, got: ${countdownWhiles[0].dsa.explanationDetail.semantics}`
  );
  const countdownExit = countdownWhiles[countdownWhiles.length - 1];
  assert.ok(
    countdownExit.dsa.explanationDetail.semantics.includes('0 > 0') &&
    countdownExit.dsa.explanationDetail.semantics.includes('Sai (false)'),
    `Exit while must be 0 > 0 -> false, got: ${countdownExit.dsa.explanationDetail.semantics}`
  );

  const boolEqFalseStep = f2Trace.find(s => s.funcName === 'stepCountdown' && s.codeText.includes('if (isArmed == false)'));
  assert.ok(boolEqFalseStep, 'Missing if (isArmed == false) step');
  assert.ok(
    boolEqFalseStep.dsa.explanationDetail.semantics.includes('isArmed = false') &&
    boolEqFalseStep.dsa.explanationDetail.semantics.includes('false == false') &&
    boolEqFalseStep.dsa.explanationDetail.semantics.includes('Đúng (true)'),
    `isArmed == false must evaluate true after flip, got: ${boolEqFalseStep.dsa.explanationDetail.semantics}`
  );

  console.log(`  ✅ Fixture 02 (02_bool_flag_countdown.cpp): ${f2Trace.length} steps, stdout="2"`);

  const summary = {
    generatedAt: new Date().toISOString(),
    fixtures: [
      {
        file: '01_window_bound_scan.cpp',
        stdout: (f1Res.finalStdout || '').trim(),
        steps: f1Trace.length,
        highlights: [clampFalseStep, whileSteps[0], lastWhile, eqCheckStep, compoundElseIfStep].map(s => ({
          step: s.step,
          line: s.line,
          funcName: s.funcName,
          codeText: s.codeText,
          upcoming: s.dsa.explanationDetail.upcoming,
          semantics: s.dsa.explanationDetail.semantics,
        })),
      },
      {
        file: '02_bool_flag_countdown.cpp',
        stdout: (f2Res.finalStdout || '').trim(),
        steps: f2Trace.length,
        highlights: [negBoolStep, countdownWhiles[0], countdownExit, boolEqFalseStep].map(s => ({
          step: s.step,
          line: s.line,
          funcName: s.funcName,
          codeText: s.codeText,
          upcoming: s.dsa.explanationDetail.upcoming,
          semantics: s.dsa.explanationDetail.semantics,
        })),
      },
    ],
  };

  if (process.env.M24_ARTIFACT_JSON) {
    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`  📄 Saved native acceptance excerpts to ${ARTIFACT_PATH}`);
  }

  console.log('✅ All M2.4 Native C++/GDB Acceptance Checks PASSED!');
  return summary;
}

if (require.main === module) {
  runM24AcceptanceTests().catch(err => {
    console.error('❌ M2.4 Native Acceptance failed:', err);
    process.exit(1);
  });
}

module.exports = { runM24AcceptanceTests };
