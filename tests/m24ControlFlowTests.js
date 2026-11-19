const assert = require('assert');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer');

// Mirrors M2.3 shared truthfulness timing guard for before-statement steps
const COMPLETED_ACTION_KEYWORDS = [
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

function assertBeforeStatementTiming(step, label) {
  const { upcoming, semantics } = step.dsa.explanationDetail;
  assert.strictEqual(step.snapshotConvention, 'before-statement', `${label}: must use before-statement convention`);
  for (const kw of COMPLETED_ACTION_KEYWORDS) {
    assert.ok(!upcoming.toLowerCase().includes(kw), `${label}: upcoming must not contain completed keyword "${kw}"`);
    assert.ok(!semantics.toLowerCase().includes(kw), `${label}: semantics must not contain completed keyword "${kw}"`);
  }
}

function runM24ControlFlowTests() {
  console.log('\n🧪 Running M2.4 Control-Flow Evidence & Adversarial Unit Tests...');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  // 1. Factorial base cases n=4 and n=1
  test('M24-01: factorial if (n <= 1) return 1; accurately distinguishes n=4 (false) and n=1 (true)', () => {
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0', isHighlighted: false, line: 10, encodedLocals: {} },
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x1000', 'int', 4] } },
        ],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0', isHighlighted: false, line: 10, encodedLocals: {} },
          { funcName: 'factorial', frameId: 'f2', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x1040', 'int', 1] } },
        ],
        heap: {}, deletedAddresses: [],
      },
    ];
    const trace = normalizeTrace(raw);
    const semFalse = trace[0].dsa.explanationDetail.semantics;
    const semTrue = trace[1].dsa.explanationDetail.semantics;

    assertBeforeStatementTiming(trace[0], 'n=4');
    assert.ok(semFalse.includes('n = 4') && semFalse.includes('4 <= 1') && semFalse.includes('Sai (false)'),
      `Expected grounded n=4 false evaluation, got: ${semFalse}`);
    assert.ok(!semFalse.includes('thỏa mãn'), `Must not claim satisfied on n=4: ${semFalse}`);

    assertBeforeStatementTiming(trace[1], 'n=1');
    assert.ok(semTrue.includes('n = 1') && semTrue.includes('1 <= 1') && semTrue.includes('Đúng (true)'),
      `Expected grounded n=1 true evaluation, got: ${semTrue}`);
    assert.ok(semTrue.includes('Điều kiện dừng') && semTrue.includes('chuẩn bị thực hiện lệnh return'),
      `Expected prospective base-case wording on n=1: ${semTrue}`);
  });

  // 2. Equality vs less-than edge case
  test('M24-02: if (n == 0) vs if (n < 1) vs if (n <= 1) when n=1', () => {
    const mk = (code) => normalizeTrace([{
      event: 'stepLine', line: 5, funcName: 'f',
      codeText: code,
      stackToRender: [{
        funcName: 'f', frameId: 'f0', isHighlighted: true, line: 5,
        encodedLocals: { n: ['C_DATA', '0x1000', 'int', 1] },
      }],
      heap: {}, deletedAddresses: [],
    }])[0];

    const eqStep = mk('if (n == 0) return 1;');
    const ltStep = mk('if (n < 1) return 1;');
    const leStep = mk('if (n <= 1) return 1;');

    assert.ok(eqStep.dsa.explanationDetail.semantics.includes('1 == 0') &&
              eqStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
      `n==0 with n=1 must be false: ${eqStep.dsa.explanationDetail.semantics}`);
    assert.ok(ltStep.dsa.explanationDetail.semantics.includes('1 < 1') &&
              ltStep.dsa.explanationDetail.semantics.includes('Sai (false)'),
      `n<1 with n=1 must be false: ${ltStep.dsa.explanationDetail.semantics}`);
    assert.ok(leStep.dsa.explanationDetail.semantics.includes('1 <= 1') &&
              leStep.dsa.explanationDetail.semantics.includes('Đúng (true)'),
      `n<=1 with n=1 must be true: ${leStep.dsa.explanationDetail.semantics}`);
  });

  // 3. while (low <= high) true & false + empty-init for + non-empty-init for fallback
  test('M24-03: while (low <= high) true and false, plus for-loop init/incr safety boundary', () => {
    const raw = [
      {
        event: 'stepLine', line: 8, funcName: 'bsearch',
        codeText: 'while (low <= high) {',
        stackToRender: [{
          funcName: 'bsearch', frameId: 'f0', isHighlighted: true, line: 8,
          encodedLocals: {
            low: ['C_DATA', '0x10', 'int', 2],
            high: ['C_DATA', '0x14', 'int', 5],
          },
        }],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 8, funcName: 'bsearch',
        codeText: 'while (low <= high) {',
        stackToRender: [{
          funcName: 'bsearch', frameId: 'f0', isHighlighted: true, line: 8,
          encodedLocals: {
            low: ['C_DATA', '0x10', 'int', 6],
            high: ['C_DATA', '0x14', 'int', 5],
          },
        }],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 12, funcName: 'bsearch',
        codeText: 'for (int i = 0; i < 5; ++i) {',
        stackToRender: [{
          funcName: 'bsearch', frameId: 'f0', isHighlighted: true, line: 12,
          encodedLocals: { i: ['C_DATA', '0x18', 'int', 0] },
        }],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 15, funcName: 'bsearch',
        codeText: 'for (; low <= high; ) {',
        stackToRender: [{
          funcName: 'bsearch', frameId: 'f0', isHighlighted: true, line: 15,
          encodedLocals: {
            low: ['C_DATA', '0x10', 'int', 6],
            high: ['C_DATA', '0x14', 'int', 5],
          },
        }],
        heap: {}, deletedAddresses: [],
      },
    ];
    const trace = normalizeTrace(raw);
    assertBeforeStatementTiming(trace[0], 'while true');
    assert.ok(trace[0].dsa.explanationDetail.semantics.includes('low = 2, high = 5') &&
              trace[0].dsa.explanationDetail.semantics.includes('2 <= 5') &&
              trace[0].dsa.explanationDetail.semantics.includes('Đúng (true)'),
      `while true mismatch: ${trace[0].dsa.explanationDetail.semantics}`);

    assertBeforeStatementTiming(trace[1], 'while false');
    assert.ok(trace[1].dsa.explanationDetail.semantics.includes('low = 6, high = 5') &&
              trace[1].dsa.explanationDetail.semantics.includes('6 <= 5') &&
              trace[1].dsa.explanationDetail.semantics.includes('Sai (false)'),
      `while false mismatch: ${trace[1].dsa.explanationDetail.semantics}`);

    // Classic for(int i = 0; i < 5; ++i) must NOT evaluate condition against pre-increment/pre-init i
    assert.ok(!trace[2].dsa.explanationDetail.semantics.includes('Đúng (true)') &&
              !trace[2].dsa.explanationDetail.semantics.includes('Sai (false)'),
      `for(init;cond;incr) must remain GENERIC: ${trace[2].dsa.explanationDetail.semantics}`);

    // Pure for(; low <= high; ) can safely evaluate
    assert.ok(trace[3].dsa.explanationDetail.semantics.includes('6 <= 5') &&
              trace[3].dsa.explanationDetail.semantics.includes('Sai (false)'),
      `for(; low <= high; ) should evaluate cleanly: ${trace[3].dsa.explanationDetail.semantics}`);
  });

  // 4. Nested / shadowed calls with duplicate variable names — active frame ONLY
  test('M24-04: Nested shadowed locals never leak caller values into active callee evaluation', () => {
    const raw = [
      {
        event: 'stepLine', line: 20, funcName: 'inner',
        codeText: 'while (low <= high) {',
        stackToRender: [
          {
            funcName: 'outer', frameId: 'f0', isHighlighted: false, line: 10,
            encodedLocals: {
              low: ['C_DATA', '0x100', 'int', 10],
              high: ['C_DATA', '0x104', 'int', 2],
            },
          },
          {
            funcName: 'inner', frameId: 'f1', isHighlighted: true, line: 20,
            encodedLocals: {
              low: ['C_DATA', '0x200', 'int', 1],
              high: ['C_DATA', '0x204', 'int', 4],
            },
          },
        ],
        heap: {}, deletedAddresses: [],
      },
      {
        // Active frame missing `flag`, while caller has `flag = true`
        event: 'stepLine', line: 25, funcName: 'inner',
        codeText: 'if (flag) return;',
        stackToRender: [
          {
            funcName: 'outer', frameId: 'f0', isHighlighted: false, line: 10,
            encodedLocals: { flag: ['C_DATA', '0x108', 'bool', true] },
          },
          {
            funcName: 'inner', frameId: 'f1', isHighlighted: true, line: 25,
            encodedLocals: {},
          },
        ],
        heap: {}, deletedAddresses: [],
      },
    ];
    const trace = normalizeTrace(raw);
    const sem0 = trace[0].dsa.explanationDetail.semantics;
    assert.ok(sem0.includes('1 <= 4') && sem0.includes('Đúng (true)'),
      `Must use active inner frame (1 <= 4), got: ${sem0}`);
    assert.ok(!sem0.includes('10 <= 2') && !sem0.includes('Sai (false)'),
      `Must NEVER use caller outer frame values, got: ${sem0}`);

    const sem1 = trace[1].dsa.explanationDetail.semantics;
    assert.ok(!sem1.includes('Đúng (true)') && !sem1.includes('Sai (false)'),
      `Active frame missing variable must NOT borrow caller flag=true: ${sem1}`);
  });

  // 5. Unknown, uninitialized ('?'), missing, non-int types, and signed/unsigned trap
  test('M24-05: Uninitialized, missing, float/char/pointer and signed/unsigned trap fall back to GENERIC', () => {
    const checkGenericFallback = (codeText, encodedLocals, desc) => {
      const step = normalizeTrace([{
        event: 'stepLine', line: 10, funcName: 'testFn',
        codeText,
        stackToRender: [{ funcName: 'testFn', frameId: 'f0', isHighlighted: true, line: 10, encodedLocals }],
        heap: {}, deletedAddresses: [],
      }])[0];
      const sem = step.dsa.explanationDetail.semantics;
      assert.ok(!sem.includes('Đúng (true)') && !sem.includes('Sai (false)'),
        `${desc} must fall back to GENERIC, got: ${sem}`);
    };

    checkGenericFallback('while (low <= high) {', {
      low: ['C_DATA', '0x10', 'uninitialized', '?'],
      high: ['C_DATA', '0x14', 'int', 5],
    }, 'uninitialized operand ?');

    checkGenericFallback('if (count > 0) {', {
      other: ['C_DATA', '0x10', 'int', 3],
    }, 'missing variable');

    checkGenericFallback('if (ratio > 1) {', {
      ratio: ['C_DATA', '0x10', 'double', 1.5],
    }, 'floating-point operand');

    checkGenericFallback('if (ch == 65) {', {
      ch: ['C_DATA', '0x10', 'char', "65 'A'"],
    }, 'char operand');

    checkGenericFallback('if (offset < cap) {', {
      offset: ['C_DATA', '0x10', 'int', -1],
      cap: ['C_DATA', '0x14', 'unsigned int', 5],
    }, 'signed negative vs unsigned comparison');

    checkGenericFallback('if (flag) {', {
      flag: ['C_DATA', '0x10', 'uninitialized', '?'],
    }, 'uninitialized bool');

    checkGenericFallback('if (val == 010) {', {
      val: ['C_DATA', '0x10', 'int', 8],
    }, 'octal literal 010');
  });

  // 6. Unsupported compound / complex / mutating expressions fall back cleanly
  test('M24-06: Compound, array, arithmetic, call, dereference, STL, assignment conditions stay GENERIC', () => {
    const locals = {
      a: ['C_DATA', '0x10', 'int', 1],
      b: ['C_DATA', '0x14', 'int', 2],
      c: ['C_DATA', '0x18', 'int', 3],
      i: ['C_DATA', '0x1c', 'int', 0],
      target: ['C_DATA', '0x20', 'int', 5],
    };
    const unsupported = [
      'if (a < b && b < c) {',
      'while (a == 0 || b == 2) {',
      'if (arr[i] == target) {',
      'if (a + b == c) {',
      'if (helper(a) == 0) {',
      'if (*ptr == 0) {',
      'if (node->val > 0) {',
      'while (!stk.empty()) {',
      'if (++a == 2) {',
      'if (a = 2) {',
    ];
    for (const codeText of unsupported) {
      const step = normalizeTrace([{
        event: 'stepLine', line: 12, funcName: 'testFn',
        codeText,
        stackToRender: [{ funcName: 'testFn', frameId: 'f0', isHighlighted: true, line: 12, encodedLocals: locals }],
        heap: {}, deletedAddresses: [],
      }])[0];
      const sem = step.dsa.explanationDetail.semantics;
      assert.ok(!sem.includes('Đúng (true)') && !sem.includes('Sai (false)'),
        `Unsupported condition "${codeText}" must stay GENERIC, got: ${sem}`);
    }
  });

  // 7. Simple boolean conditions + negative integers + else-if
  test('M24-07: Simple bool predicates, negative literals, and } else if branches evaluate accurately', () => {
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'f',
        codeText: 'if (isArmed) {',
        stackToRender: [{ funcName: 'f', frameId: 'f0', isHighlighted: true, line: 5,
          encodedLocals: { isArmed: ['C_DATA', '0x10', 'bool', true] } }],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 6, funcName: 'f',
        codeText: 'if (!isArmed) {',
        stackToRender: [{ funcName: 'f', frameId: 'f0', isHighlighted: true, line: 6,
          encodedLocals: { isArmed: ['C_DATA', '0x10', 'bool', true] } }],
        heap: {}, deletedAddresses: [],
      },
      {
        event: 'stepLine', line: 7, funcName: 'f',
        codeText: '} else if (prevIdx != -1) {',
        stackToRender: [{ funcName: 'f', frameId: 'f0', isHighlighted: true, line: 7,
          encodedLocals: { prevIdx: ['C_DATA', '0x14', 'int', -1] } }],
        heap: {}, deletedAddresses: [],
      },
    ];
    const trace = normalizeTrace(raw);
    assert.ok(trace[0].dsa.explanationDetail.semantics.includes('isArmed = true') &&
              trace[0].dsa.explanationDetail.semantics.includes('Đúng (true)'));
    assert.ok(trace[1].dsa.explanationDetail.semantics.includes('isArmed = true') &&
              trace[1].dsa.explanationDetail.semantics.includes('Sai (false)'));
    assert.ok(trace[2].dsa.explanationDetail.semantics.includes('prevIdx = -1') &&
              trace[2].dsa.explanationDetail.semantics.includes('-1 != -1') &&
              trace[2].dsa.explanationDetail.semantics.includes('Sai (false)'));
  });

  // 8. Truncated / unexpected post-condition trace stays strictly honest to snapshot before statement
  test('M24-08: Condition at truncated end-of-trace stays prospective and never fabricates transitions', () => {
    const raw = [
      {
        event: 'stepLine', line: 10, funcName: 'guardFn',
        codeText: 'if (v == 0) return;',
        stackToRender: [{
          funcName: 'guardFn', frameId: 'f0', isHighlighted: true, line: 10,
          encodedLocals: { v: ['C_DATA', '0x10', 'int', 0] },
        }],
        heap: {}, deletedAddresses: [],
      },
    ];
    const trace = normalizeTrace(raw);
    const step = trace[0];
    assertBeforeStatementTiming(step, 'truncated trace');
    assert.ok(step.dsa.explanationDetail.semantics.includes('0 == 0') &&
              step.dsa.explanationDetail.semantics.includes('Đúng (true)'),
      `Must still evaluate verified current snapshot: ${step.dsa.explanationDetail.semantics}`);
    assert.ok(step.dsa.explanationDetail.semantics.includes('xác nhận ở bước kế tiếp') ||
              step.dsa.explanationDetail.semantics.includes('chuẩn bị'),
      `Must qualify prospective control-flow implication cleanly: ${step.dsa.explanationDetail.semantics}`);
    assert.strictEqual(step.dsa.diff.scalarUpdates.length, 0);
  });

  console.log(`M2.4 Control-Flow Unit Test Summary: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    const err = new Error('M2.4 control-flow unit tests failed');
    err.summary = { passed, failed, total: passed + failed };
    throw err;
  }
  return { passed, failed, total: passed + failed };
}

if (require.main === module) {
  runM24ControlFlowTests();
}

module.exports = { runM24ControlFlowTests };
