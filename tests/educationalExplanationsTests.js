const assert = require('assert');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer.js');

function runEducationalExplanationsTests() {
  console.log('='.repeat(70));
  console.log('🧪 Running M2.1 Evidence-Based Educational Explanations Test Suite');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ FAIL: ${name} -> ${err.message}`);
      console.error(err.stack);
      failed++;
    }
  }

  // =========================================================================
  // FIXTURE A: Sequential scalar assignments & before-statement causal safety
  // =========================================================================
  test('Fixture A: Sequential scalar assignments enforce strict before-statement convention', () => {
    const raw = [
      {
        event: 'stepLine', line: 2, funcName: 'main',
        codeText: 'int x = 10;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 2,
          orderedVarNames: ['x'],
          encodedLocals: { x: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 3, funcName: 'main',
        codeText: 'int y = 20;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 3,
          orderedVarNames: ['x', 'y'],
          encodedLocals: {
            x: ['C_DATA', '0x1000', 'int', 10],
            y: ['C_DATA', '0x1004', 'uninitialized', '?']
          }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 4, funcName: 'main',
        codeText: 'x = x + y;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 4,
          orderedVarNames: ['x', 'y'],
          encodedLocals: {
            x: ['C_DATA', '0x1000', 'int', 10],
            y: ['C_DATA', '0x1004', 'int', 20]
          }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 5, funcName: 'main',
        codeText: 'return 0;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 5,
          orderedVarNames: ['x', 'y'],
          encodedLocals: {
            x: ['C_DATA', '0x1000', 'int', 30],
            y: ['C_DATA', '0x1004', 'int', 20]
          }
        }],
        heap: {}, deletedAddresses: []
      }
    ];

    const trace = normalizeTrace(raw);
    assert.strictEqual(trace.length, 4);

    // Step 0: Before x = 10 executes
    const s0 = trace[0];
    assert.ok(s0.dsa.explanationDetail.upcoming.includes('khai báo') || s0.dsa.explanationDetail.upcoming.includes('int x = 10;'),
      `Step 0 upcoming must describe pending declaration, got: ${s0.dsa.explanationDetail.upcoming}`);
    assert.strictEqual(s0.dsa.diff.scalarUpdates.length, 0, 'Step 0 must have no scalar deltas');

    // Step 1: x initialized to 10 from previous step, but y = 20 is BEFORE execution
    const s1 = trace[1];
    assert.strictEqual(s1.dsa.diff.scalarUpdates.length, 1);
    assert.strictEqual(s1.dsa.diff.scalarUpdates[0].name, 'x');
    assert.strictEqual(s1.dsa.diff.scalarUpdates[0].to, 10);
    assert.strictEqual(s1.dsa.diff.scalarUpdates[0].wasUninitialized, true);
    assert.ok(s1.dsa.explanationDetail.observed.includes('Biến x được khởi tạo giá trị 10'),
      `Observed must report x initialized to 10, got: ${s1.dsa.explanationDetail.observed}`);
    // REJECT FALSE CAUSAL CLAIM: y is NOT 20 yet!
    assert.ok(!s1.dsa.explanationDetail.observed.includes('y'), 'y must not be reported as modified before execution');

    // Step 2: Before x = x + y executes
    const s2 = trace[2];
    assert.strictEqual(s2.dsa.diff.scalarUpdates.length, 1);
    assert.strictEqual(s2.dsa.diff.scalarUpdates[0].name, 'y');
    assert.strictEqual(s2.dsa.diff.scalarUpdates[0].to, 20);
    // REJECT FALSE CAUSAL CLAIM: x has NOT become 30 yet!
    assert.ok(!s2.dsa.explanationDetail.observed.includes('30'), 'x must NOT be claimed as 30 before statement line 4 executes');

    // Step 3: At return 0, x is observed to have changed from 10 to 30
    const s3 = trace[3];
    assert.strictEqual(s3.dsa.diff.scalarUpdates.length, 1);
    assert.strictEqual(s3.dsa.diff.scalarUpdates[0].name, 'x');
    assert.strictEqual(s3.dsa.diff.scalarUpdates[0].from, 10);
    assert.strictEqual(s3.dsa.diff.scalarUpdates[0].to, 30);
    assert.ok(s3.dsa.explanationDetail.observed.includes('Biến x thay đổi từ 10 thành 30'),
      `Observed must report x change to 30, got: ${s3.dsa.explanationDetail.observed}`);
  });

  // =========================================================================
  // FIXTURE B: Array element updates
  // =========================================================================
  test('Fixture B: Array element updates are correctly captured and attributed', () => {
    const raw = [
      {
        event: 'stepLine', line: 2, funcName: 'main',
        codeText: 'int a[3] = {1, 2, 3};',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 2,
          orderedVarNames: ['a'],
          encodedLocals: {
            a: ['C_ARRAY', '0x2000',
              ['C_DATA', '0x2000', 'int', 1],
              ['C_DATA', '0x2004', 'int', 2],
              ['C_DATA', '0x2008', 'int', 3]
            ]
          }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 3, funcName: 'main',
        codeText: 'a[1] = 99;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 3,
          orderedVarNames: ['a'],
          encodedLocals: {
            a: ['C_ARRAY', '0x2000',
              ['C_DATA', '0x2000', 'int', 1],
              ['C_DATA', '0x2004', 'int', 2],
              ['C_DATA', '0x2008', 'int', 3]
            ]
          }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 4, funcName: 'main',
        codeText: 'return 0;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 4,
          orderedVarNames: ['a'],
          encodedLocals: {
            a: ['C_ARRAY', '0x2000',
              ['C_DATA', '0x2000', 'int', 1],
              ['C_DATA', '0x2004', 'int', 99],
              ['C_DATA', '0x2008', 'int', 3]
            ]
          }
        }],
        heap: {}, deletedAddresses: []
      }
    ];

    const trace = normalizeTrace(raw);

    // Step 1: Before a[1] = 99 executes, a[1] is still 2!
    const s1 = trace[1];
    assert.strictEqual(s1.dsa.diff.arrayUpdates.length, 0);
    assert.ok(s1.dsa.explanationDetail.upcoming.includes('a[1] = 99') || s1.dsa.explanationDetail.upcoming.includes('cập nhật giá trị'),
      `Upcoming must describe pending array assignment, got: ${s1.dsa.explanationDetail.upcoming}`);

    // Step 2: At return 0, a[1] changed from 2 to 99
    const s2 = trace[2];
    assert.strictEqual(s2.dsa.diff.arrayUpdates.length, 1);
    assert.strictEqual(s2.dsa.diff.arrayUpdates[0].arrayName, 'a');
    assert.strictEqual(s2.dsa.diff.arrayUpdates[0].index, 1);
    assert.strictEqual(s2.dsa.diff.arrayUpdates[0].from, 2);
    assert.strictEqual(s2.dsa.diff.arrayUpdates[0].to, 99);
    assert.ok(s2.dsa.explanationDetail.observed.includes('Phần tử mảng a[1] thay đổi từ 2 thành 99'),
      `Observed must state a[1] mutated to 99, got: ${s2.dsa.explanationDetail.observed}`);
  });

  // =========================================================================
  // FIXTURE C: Recursive factorial with multiple same-name locals
  // =========================================================================
  test('Fixture C: Recursive activations keep same-name variables strictly disambiguated', () => {
    const raw = [
      // Step 0: main calls factorial(2)
      {
        event: 'stepLine', line: 7, funcName: 'main',
        codeText: 'int res = factorial(2);',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 7,
          orderedVarNames: ['res'],
          encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      },
      // Step 1: factorial(n=2) pushed
      {
        event: 'stepLine', line: 2, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 7,
            orderedVarNames: ['res'],
            encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] }
          },
          {
            funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 2, frameDepth: 1,
            orderedVarNames: ['n'],
            encodedLocals: { n: ['C_DATA', '0x1100', 'int', 2] }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 2: factorial(n=2) calls factorial(n-1)
      {
        event: 'stepLine', line: 3, funcName: 'factorial',
        codeText: 'return n * factorial(n - 1);',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 7,
            orderedVarNames: ['res'],
            encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] }
          },
          {
            funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 3, frameDepth: 1,
            orderedVarNames: ['n'],
            encodedLocals: { n: ['C_DATA', '0x1100', 'int', 2] }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 3: factorial(n=1) pushed
      {
        event: 'stepLine', line: 2, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 7,
            orderedVarNames: ['res'],
            encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] }
          },
          {
            funcName: 'factorial', frameId: 'f1', isHighlighted: false, line: 3, frameDepth: 1,
            orderedVarNames: ['n'],
            encodedLocals: { n: ['C_DATA', '0x1100', 'int', 2] }
          },
          {
            funcName: 'factorial', frameId: 'f2', isHighlighted: true, line: 2, frameDepth: 2,
            orderedVarNames: ['n'],
            encodedLocals: { n: ['C_DATA', '0x1200', 'int', 1] }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 4: factorial(1) returns, stack pops back to factorial(2)
      {
        event: 'stepLine', line: 3, funcName: 'factorial',
        codeText: 'return n * factorial(n - 1);',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 7,
            orderedVarNames: ['res'],
            encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] }
          },
          {
            funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 3, frameDepth: 1,
            orderedVarNames: ['n'],
            encodedLocals: { n: ['C_DATA', '0x1100', 'int', 2] }
          }
        ],
        heap: {}, deletedAddresses: []
      }
    ];

    const trace = normalizeTrace(raw);

    // Step 1: Push transition
    const s1 = trace[1];
    assert.strictEqual(s1.dsa.diff.frameTransition.type, 'push');
    assert.strictEqual(s1.dsa.diff.frameTransition.funcName, 'factorial');
    assert.strictEqual(s1.dsa.diff.frameTransition.depth, 1);
    assert.ok(s1.dsa.explanationDetail.observed.includes('Đã tạo khung ngăn xếp mới cho hàm factorial() ở độ sâu 1'),
      `Observed must report Push, got: ${s1.dsa.explanationDetail.observed}`);

    // Step 3: Deeper push transition
    const s3 = trace[3];
    assert.strictEqual(s3.dsa.diff.frameTransition.type, 'push');
    assert.strictEqual(s3.dsa.diff.frameTransition.depth, 2);
    // Base case semantics
    assert.ok(s3.dsa.explanationDetail.semantics.includes('Điều kiện dừng') || s3.dsa.explanationDetail.semantics.includes('base case'),
      `Semantics must explain base case check, got: ${s3.dsa.explanationDetail.semantics}`);

    // Step 4: Pop transition
    const s4 = trace[4];
    assert.strictEqual(s4.dsa.diff.frameTransition.type, 'pop');
    assert.strictEqual(s4.dsa.diff.frameTransition.funcName, 'factorial');
    assert.ok(s4.dsa.explanationDetail.observed.includes('Khung ngăn xếp của hàm factorial() đã hoàn thành và được thu hồi (Pop)'),
      `Observed must report Pop, got: ${s4.dsa.explanationDetail.observed}`);
  });

  // =========================================================================
  // FIXTURE D: Non-recursive nested calls and returns
  // =========================================================================
  test('Fixture D: Non-recursive nested calls and returns report clean transitions', () => {
    const raw = [
      {
        event: 'stepLine', line: 10, funcName: 'main',
        codeText: 'int s = add(3, 4);',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
          orderedVarNames: ['s'],
          encodedLocals: { s: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 2, funcName: 'add',
        codeText: 'return a + b;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0', isHighlighted: false, line: 10, encodedLocals: { s: ['C_DATA', '0x1000', 'uninitialized', '?'] } },
          { funcName: 'add', frameId: 'f1', isHighlighted: true, line: 2, frameDepth: 1, encodedLocals: { a: ['C_DATA', '0x1010', 'int', 3], b: ['C_DATA', '0x1014', 'int', 4] } }
        ],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 11, funcName: 'main',
        codeText: 'return 0;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 11,
          orderedVarNames: ['s'],
          encodedLocals: { s: ['C_DATA', '0x1000', 'int', 7] }
        }],
        heap: {}, deletedAddresses: []
      }
    ];

    const trace = normalizeTrace(raw);
    assert.strictEqual(trace[1].dsa.diff.frameTransition.type, 'push');
    assert.strictEqual(trace[1].dsa.diff.frameTransition.funcName, 'add');

    assert.strictEqual(trace[2].dsa.diff.frameTransition.type, 'pop');
    assert.strictEqual(trace[2].dsa.diff.frameTransition.funcName, 'add');
    assert.strictEqual(trace[2].dsa.diff.scalarUpdates.length, 1);
    assert.strictEqual(trace[2].dsa.diff.scalarUpdates[0].name, 's');
    assert.strictEqual(trace[2].dsa.diff.scalarUpdates[0].to, 7);
  });

  // =========================================================================
  // FIXTURE E: LeetCode 124-style unfamiliar Branch structure
  // =========================================================================
  test('Fixture E: Unfamiliar Branch struct (weight, small, large) with exact trace progression', () => {
    // Exact topology: Root weight=1, small=&leftNode (weight=19), large=&rightNode (weight=20)
    // Root one-way gain = 21, Maximum path sum = 40
    const raw = [
      // Step 0: main creates nodes
      {
        event: 'stepLine', line: 28, funcName: 'main',
        codeText: 'int rootGain = maxGain(&root);',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 28,
          orderedVarNames: ['leftNode', 'rightNode', 'root', 'rootGain'],
          encodedLocals: {
            leftNode: ['C_STRUCT', '0x2000', 'Branch', ['weight', ['C_DATA', '0x2000', 'int', 19]], ['small', ['C_DATA', '0x0', 'pointer', '0x0']], ['large', ['C_DATA', '0x0', 'pointer', '0x0']]],
            rightNode: ['C_STRUCT', '0x2020', 'Branch', ['weight', ['C_DATA', '0x2020', 'int', 20]], ['small', ['C_DATA', '0x0', 'pointer', '0x0']], ['large', ['C_DATA', '0x0', 'pointer', '0x0']]],
            root: ['C_STRUCT', '0x2040', 'Branch', ['weight', ['C_DATA', '0x2040', 'int', 1]], ['small', ['C_DATA', '0x2048', 'pointer', '0x2000']], ['large', ['C_DATA', '0x2050', 'pointer', '0x2020']]],
            rootGain: ['C_DATA', '0x2060', 'uninitialized', '?']
          }
        }],
        heap: {}, deletedAddresses: []
      },
      // Step 1: maxGain(&root) call entered
      {
        event: 'stepLine', line: 15, funcName: 'maxGain',
        codeText: 'if (node == nullptr) return 0;',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 28,
            encodedLocals: { rootGain: ['C_DATA', '0x2060', 'uninitialized', '?'] }
          },
          {
            funcName: 'maxGain', frameId: 'f1', isHighlighted: true, line: 15, frameDepth: 1,
            orderedVarNames: ['node', 'leftGain', 'rightGain', 'currentPath'],
            encodedLocals: {
              node: ['C_DATA', '0x3000', 'pointer', '0x2040'],
              leftGain: ['C_DATA', '0x3008', 'uninitialized', '?'],
              rightGain: ['C_DATA', '0x3010', 'uninitialized', '?'],
              currentPath: ['C_DATA', '0x3018', 'uninitialized', '?']
            }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 2: In maxGain(&root), leftGain has been evaluated to 19, rightGain evaluated to 20
      // Line: currentPath = node->weight + leftGain + rightGain;
      {
        event: 'stepLine', line: 18, funcName: 'maxGain',
        codeText: 'int currentPath = node->weight + leftGain + rightGain;',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 28,
            encodedLocals: { rootGain: ['C_DATA', '0x2060', 'uninitialized', '?'] }
          },
          {
            funcName: 'maxGain', frameId: 'f1', isHighlighted: true, line: 18, frameDepth: 1,
            orderedVarNames: ['node', 'leftGain', 'rightGain', 'currentPath'],
            encodedLocals: {
              node: ['C_DATA', '0x3000', 'pointer', '0x2040'],
              leftGain: ['C_DATA', '0x3008', 'int', 19],
              rightGain: ['C_DATA', '0x3010', 'int', 20],
              currentPath: ['C_DATA', '0x3018', 'uninitialized', '?']
            }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 3: currentPath is now 40 (1 + 19 + 20)
      // Line: if (currentPath > maxPath)
      {
        event: 'stepLine', line: 19, funcName: 'maxGain',
        codeText: 'if (currentPath > maxPath) {',
        stackToRender: [
          {
            funcName: 'main', frameId: 'f0', isHighlighted: false, line: 28,
            encodedLocals: { rootGain: ['C_DATA', '0x2060', 'uninitialized', '?'] }
          },
          {
            funcName: 'maxGain', frameId: 'f1', isHighlighted: true, line: 19, frameDepth: 1,
            orderedVarNames: ['node', 'leftGain', 'rightGain', 'currentPath'],
            encodedLocals: {
              node: ['C_DATA', '0x3000', 'pointer', '0x2040'],
              leftGain: ['C_DATA', '0x3008', 'int', 19],
              rightGain: ['C_DATA', '0x3010', 'int', 20],
              currentPath: ['C_DATA', '0x3018', 'int', 40]
            }
          }
        ],
        heap: {}, deletedAddresses: []
      },
      // Step 4: Function returns, main receives rootGain = 21 (1 + max(19, 20))
      // Line: cout << "Maximum path sum = " << maxPath << endl;
      {
        event: 'stepLine', line: 29, funcName: 'main',
        codeText: 'cout << "Maximum path sum = " << maxPath << endl;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 29,
          orderedVarNames: ['rootGain'],
          encodedLocals: {
            rootGain: ['C_DATA', '0x2060', 'int', 21]
          }
        }],
        heap: {}, deletedAddresses: []
      }
    ];

    const trace = normalizeTrace(raw);

    // Step 1: Push transition to maxGain
    assert.strictEqual(trace[1].dsa.diff.frameTransition.type, 'push');
    assert.strictEqual(trace[1].dsa.diff.frameTransition.funcName, 'maxGain');
    assert.ok(trace[1].dsa.explanationDetail.upcoming.includes('điều kiện rẽ nhánh'));

    // Step 2: At line 18, currentPath is NOT yet 40!
    const s2 = trace[2];
    assert.ok(s2.dsa.diff.scalarUpdates.some(u => u.name === 'leftGain' && u.to === 19));
    assert.ok(s2.dsa.diff.scalarUpdates.some(u => u.name === 'rightGain' && u.to === 20));
    assert.ok(!s2.dsa.explanationDetail.observed.includes('40'), 'currentPath must NOT be reported as 40 before line 18 executes');

    // Step 3: currentPath is observed to be 40!
    const s3 = trace[3];
    assert.ok(s3.dsa.diff.scalarUpdates.some(u => u.name === 'currentPath' && u.to === 40));
    assert.ok(s3.dsa.explanationDetail.observed.includes('Biến currentPath được khởi tạo giá trị 40'));

    // Step 4: maxGain returned, rootGain observed as 21
    const s4 = trace[4];
    assert.strictEqual(s4.dsa.diff.frameTransition.type, 'pop');
    assert.strictEqual(s4.dsa.diff.scalarUpdates[0].name, 'rootGain');
    assert.strictEqual(s4.dsa.diff.scalarUpdates[0].to, 21);
    assert.ok(s4.dsa.explanationDetail.observed.includes('Biến rootGain được khởi tạo giá trị 21'));
  });

  // =========================================================================
  // FIXTURE F: Existing NODE/LIST linked-list lesson preserved without regression
  // =========================================================================
  test('Fixture F: Existing NODE/LIST linked-list semantics preserved without regression', () => {
    const raw = [
      {
        event: 'stepLine', line: 15, funcName: 'main',
        codeText: 'NODE* p = CreateNode(42);',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 15,
          orderedVarNames: ['p'],
          encodedLocals: { p: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 16, funcName: 'main',
        codeText: 'delete p;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 16,
          orderedVarNames: ['p'],
          encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x5000'] }
        }],
        heap: {
          '0x5000': ['C_STRUCT', '0x5000', 'NODE', ['info', ['C_DATA', '0x5000', 'int', 42]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
        },
        deletedAddresses: []
      },
      {
        event: 'stepLine', line: 17, funcName: 'main',
        codeText: 'p = nullptr;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 17,
          orderedVarNames: ['p'],
          encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x5000'] }
        }],
        heap: {},
        deletedAddresses: ['0x5000']
      }
    ];

    const trace = normalizeTrace(raw);

    // Step 0: CreateNode explanation
    assert.ok(trace[0].dsa.vietnameseExplanation.includes('Cấp phát nút mới trên Heap'));

    // Step 1: Pre-delete line
    assert.ok(trace[1].dsa.vietnameseExplanation.includes('Chuẩn bị giải phóng bộ nhớ qua lệnh: delete p;'));
    assert.ok(trace[1].dsa.vietnameseExplanation.includes('0x5000'));

    // Step 2: Deallocation
    assert.ok(trace[2].dsa.vietnameseExplanation.includes('Đã thực thi giải phóng bộ nhớ (deallocation): Vùng nhớ Heap tại địa chỉ 0x5000'));
    assert.strictEqual(trace[2].dsa.diff.freedNodes[0], '0x5000');
  });

  // =========================================================================
  // FIXTURE G: Unknown/uninitialized values, pointers not scalars, discontinuous frames
  // =========================================================================
  test('Fixture G: Pointers excluded from scalar updates, discontinuous frames handled safely', () => {
    // 1. Pointers/references must NOT appear in scalarUpdates (Rule 7)
    const rawPointer = [
      {
        event: 'stepLine', line: 5, funcName: 'main', codeText: 'int* ptr = nullptr;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 5,
          encodedLocals: { ptr: ['C_DATA', '0x1000', 'pointer', '0x0'] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 6, funcName: 'main', codeText: 'ptr = &val;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 6,
          encodedLocals: { ptr: ['C_DATA', '0x1000', 'pointer', '0x7000'] }
        }],
        heap: {}, deletedAddresses: []
      }
    ];
    const tracePtr = normalizeTrace(rawPointer);
    assert.strictEqual(tracePtr[1].dsa.diff.scalarUpdates.length, 0,
      'Pointers must NOT be classified as scalarUpdates');
    assert.strictEqual(tracePtr[1].dsa.diff.pointerReroutes.length, 1,
      'Pointers must be classified as pointerReroutes');

    // 2. Discontinuous/replaced stack frames must NOT cross-compare locals (Rule 6)
    const rawDiscontinuous = [
      {
        event: 'stepLine', line: 5, funcName: 'funcA',
        stackToRender: [{
          funcName: 'funcA', frameId: 'fA', isHighlighted: true, line: 5,
          encodedLocals: { val: ['C_DATA', '0x1000', 'int', 100] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 5, funcName: 'funcB',
        stackToRender: [{
          funcName: 'funcB', frameId: 'fB', isHighlighted: true, line: 5,
          encodedLocals: { val: ['C_DATA', '0x2000', 'int', 200] }
        }],
        heap: {}, deletedAddresses: []
      }
    ];
    const traceDisc = normalizeTrace(rawDiscontinuous);
    assert.strictEqual(traceDisc[1].dsa.diff.scalarUpdates.length, 0,
      'Must NOT compare variable `val` across replaced/mismatched frames funcA and funcB');

    // 3. Uninitialized scalar remains ? and reports neutral when unmodified
    const rawUninit = [
      {
        event: 'stepLine', line: 1, funcName: 'main', codeText: 'int uninit;',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 1,
          encodedLocals: { uninit: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 2, funcName: 'main', codeText: ';',
        stackToRender: [{
          funcName: 'main', frameId: 'f0', isHighlighted: true, line: 2,
          encodedLocals: { uninit: ['C_DATA', '0x1000', 'uninitialized', '?'] }
        }],
        heap: {}, deletedAddresses: []
      }
    ];
    const traceUninit = normalizeTrace(rawUninit);
    assert.strictEqual(traceUninit[1].dsa.diff.scalarUpdates.length, 0,
      'Persistently uninitialized variable must not report a scalar update');
    assert.ok(traceUninit[1].dsa.explanationDetail.observed.includes('Không có thay đổi biến nào trong bộ nhớ ở bước trước.'),
      'Honest neutral explanation when no changes occurred');
  });

  // =========================================================================
  // FIX 1 ADVERSARIAL TESTS: Base-case semantics must not claim termination
  // when condition might be false (e.g. n=4 checking if(n<=1))
  // =========================================================================

  test('Fix1-A: if(n<=1) with n=4 at depth>1 must NOT claim base case termination', () => {
    // 2-frame stack: main(f0) + factorial(f1), n=4; "potential" only
    const raw = [
      {
        event: 'stepLine', line: 2, funcName: 'main',
        codeText: 'int res = factorial(4);',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 2,
          encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] } }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 6, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'main',      frameId: 'f0', isHighlighted: false, line: 2,
            encodedLocals: { res: ['C_DATA', '0x1000', 'uninitialized', '?'] } },
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 6,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 4] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[1].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('kết thúc') && !sem.includes('backtrack') && !sem.includes('đã được xác nhận'),
      `Fix1-A: Must NOT claim termination when n=4. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('tiềm năng') || sem.includes('potential') || sem.includes('kiểm tra') || sem.toLowerCase().includes('điều kiện'),
      `Fix1-A: Must use neutral/potential language for n=4. Got: "${sem}"`
    );
  });

  test('Fix1-B: if(n<=1) with n=1 at depth=1 (stackFrames.length===1) CONFIRMS base case', () => {
    // 1-frame stack only: factorial(f0), n=1 — single active frame → confirmed
    const raw = [
      {
        event: 'stepLine', line: 6, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f0', isHighlighted: true, line: 6,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 7, funcName: 'factorial',
        codeText: 'return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f0', isHighlighted: true, line: 7,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    // Step 0: before 'if (n<=1)' — only 1 frame, semantics must confirm base case
    const sem0 = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      sem0.includes('thỏa mãn') || sem0.includes('Điều kiện dừng') || sem0.includes('base case'),
      `Fix1-B: Must confirm base case at depth=1 (n=1). Got: "${sem0}"`
    );
    assert.ok(
      !sem0.includes('tiềm năng'),
      `Fix1-B: Must NOT say "tiềm năng" when base case is confirmed. Got: "${sem0}"`
    );
  });

  test('Fix1-C: if(n<=1) with unknown n at depth>1 must use neutral wording', () => {
    // 2-frame stack, n is uninitialized ('?') — cannot determine outcome
    const raw = [
      {
        event: 'stepLine', line: 2, funcName: 'main',
        codeText: 'int res = factorial(x);',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 2,
          encodedLocals: {} }],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 6, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'main',      frameId: 'f0', isHighlighted: false, line: 2,
            encodedLocals: {} },
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 6,
            encodedLocals: { n: ['C_DATA', '0x2000', 'uninitialized', '?'] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[1].dsa.explanationDetail.semantics;
    // depth=2 → cannot confirm; must not claim confirmed termination
    assert.ok(
      !sem.includes('đã được xác nhận') && !sem.includes('kết thúc chuỗi đệ quy'),
      `Fix1-C: Must NOT confirm base case for unknown n at depth>1. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('tiềm năng') || sem.includes('potential') || sem.includes('kiểm tra') || sem.toLowerCase().includes('điều kiện'),
      `Fix1-C: Must use neutral language for unknown n. Got: "${sem}"`
    );
  });

  test('Fix1-D: if (n == 0) return 1; with n=1 must NOT confirm termination', () => {
    // Counterexample 1: n = 1, condition is n == 0 => FALSE
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n == 0) return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('thỏa mãn') && !sem.includes('đã được xác nhận') && !sem.includes('chuỗi đệ quy kết thúc'),
      `Fix1-D: Must NOT confirm termination for if (n == 0) when n=1. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('chưa được đáp ứng') || sem.includes('tiềm năng') || sem.includes('không khớp'),
      `Fix1-D: Must report condition as not satisfied. Got: "${sem}"`
    );
  });

  test('Fix1-E: if (n < 1) return 1; with n=1 must NOT confirm termination', () => {
    // Counterexample 2: n = 1, condition is n < 1 => FALSE
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n < 1) return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('thỏa mãn') && !sem.includes('đã được xác nhận') && !sem.includes('chuỗi đệ quy kết thúc'),
      `Fix1-E: Must NOT confirm termination for if (n < 1) when n=1. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('chưa được đáp ứng') || sem.includes('tiềm năng') || sem.includes('không khớp'),
      `Fix1-E: Must report condition as not satisfied. Got: "${sem}"`
    );
  });

  test('Fix1-F: if (n <= 1) return 1; with n=1 verifies condition as true but distinguishes pending return', () => {
    // Counterexample 3: n = 1, condition is n <= 1 => TRUE, has return
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n <= 1) return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      sem.includes('thỏa mãn') || sem.includes('Điều kiện dừng') || sem.includes('base case'),
      `Fix1-F: Must report verified condition as true. Got: "${sem}"`
    );
    // Must distinguish pending return from already completed return
    assert.ok(
      sem.includes('chuẩn bị') || sem.includes('return'),
      `Fix1-F: Must distinguish pending return. Got: "${sem}"`
    );
  });

  test('Fix1-G: true condition without terminating return must NOT be labeled as completed recursion', () => {
    // Counterexample 4: condition is true (n=1 <= 1), but no return
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n <= 1) { count++; }',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('kết thúc đệ quy') || sem.includes('chưa kết thúc đệ quy'),
      `Fix1-G: Must NOT claim completed recursion without a return. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('chưa kết thúc đệ quy') || !sem.includes('quay lui'),
      `Fix1-G: Must not claim recursion ended or backtracking begun. Got: "${sem}"`
    );
  });

  test('Fix1-H: compound predicate must use neutral explanation', () => {
    // Counterexample 5: compound predicate if (n <= 1 && flag)
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'factorial',
        codeText: 'if (n <= 1 && flag) return 1;',
        stackToRender: [
          { funcName: 'factorial', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: { n: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('Điều kiện dừng (base case) thỏa mãn'),
      `Fix1-H: Compound predicate must not be confirmed as base case without evidence. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('phức hợp') || sem.includes('không suy đoán') || sem.includes('tiềm năng'),
      `Fix1-H: Must use neutral explanation for compound predicate. Got: "${sem}"`
    );
  });

  test('Fix1-I: unknown predicate must use neutral explanation', () => {
    // Counterexample 6: unknown function predicate if (isValid(node))
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'traverse',
        codeText: 'if (isValid(node)) return 0;',
        stackToRender: [
          { funcName: 'traverse', frameId: 'f1', isHighlighted: true, line: 5,
            encodedLocals: {} }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('Điều kiện dừng (base case) thỏa mãn'),
      `Fix1-I: Unknown predicate must not be confirmed. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('tiềm năng') || sem.includes('không thể suy luận') || sem.includes('potential'),
      `Fix1-I: Must use neutral explanation for unknown predicate. Got: "${sem}"`
    );
  });

  test('Fix1-J: generic if (currentPath > maxPath) must NOT be described as potential base case', () => {
    // Concrete counterexample: generic conditional branch in LeetCode 124
    const raw = [
      {
        event: 'stepLine', line: 20, funcName: 'maxGain',
        codeText: 'if (currentPath > maxPath) {',
        stackToRender: [
          { funcName: 'maxGain', frameId: 'f1', isHighlighted: true, line: 20,
            encodedLocals: { currentPath: ['C_DATA', '0x1000', 'int', 40] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const sem = trace[0].dsa.explanationDetail.semantics;
    assert.ok(
      !sem.includes('base case') && !sem.includes('Điều kiện dừng') && !sem.includes('dừng tiềm năng'),
      `Fix1-J: Generic if must NOT be described as base case. Got: "${sem}"`
    );
    assert.ok(
      sem.includes('rẽ nhánh') || sem.includes('luồng thực thi'),
      `Fix1-J: Generic if must use neutral conditional wording. Got: "${sem}"`
    );
  });

  // =========================================================================
  // FIX 2 ADVERSARIAL TESTS: Frame continuity — prefix verification
  // =========================================================================

  test('Fix2-A: intermediate frame replacement stops variable comparison for deeper frames', () => {
    // prevFrames: [main(f0), helper(fA), leaf(f2)]
    // currFrames: [main(f0), helper(fB), leaf(f2)] — fA→fB replacement at depth 1
    // leaf(f2) has changed variable 'x', but must NOT be reported due to ancestor mismatch
    const raw = [
      {
        event: 'stepLine', line: 10, funcName: 'leaf',
        codeText: 'x = 5;',
        stackToRender: [
          { funcName: 'main',   frameId: 'f0', isHighlighted: false, line: 2,  encodedLocals: {} },
          { funcName: 'helper', frameId: 'fA', isHighlighted: false, line: 5,  encodedLocals: {} },
          { funcName: 'leaf',   frameId: 'f2', isHighlighted: true,  line: 10, encodedLocals: { x: ['C_DATA', '0x3000', 'int', 0] } }
        ],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 11, funcName: 'leaf',
        codeText: 'return x;',
        stackToRender: [
          { funcName: 'main',   frameId: 'f0', isHighlighted: false, line: 2,  encodedLocals: {} },
          { funcName: 'helper', frameId: 'fB', isHighlighted: false, line: 5,  encodedLocals: {} },
          { funcName: 'leaf',   frameId: 'f2', isHighlighted: true,  line: 11, encodedLocals: { x: ['C_DATA', '0x3000', 'int', 5] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    // Ancestor mismatch (fA→fB at depth 1) must invalidate leaf comparison
    assert.strictEqual(
      trace[1].dsa.diff.scalarUpdates.length, 0,
      'Fix2-A: leaf(f2).x change must NOT be reported when ancestor helper frame changed from fA to fB'
    );
    // frameTransition must NOT be a clean push or pop (mismatch at middle)
    const ft = trace[1].dsa.diff.frameTransition;
    assert.ok(
      ft.type === 'none' || ft.type === 'schema_error',
      `Fix2-A: frameTransition must be "none" for mid-stack replacement. Got: "${ft.type}"`
    );
  });

  test('Fix2-B: missing frameId at depth>0 does not establish continuity', () => {
    // Both prev and curr have foo with no frameId at depth 1 — same name but no ID → excluded
    const raw = [
      {
        event: 'stepLine', line: 3, funcName: 'foo',
        codeText: 'x = 1;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0',       isHighlighted: false, line: 1, encodedLocals: {} },
          { funcName: 'foo',  /* no frameId */      isHighlighted: true,  line: 3,
            encodedLocals: { x: ['C_DATA', '0x2000', 'int', 0] } }
        ],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 4, funcName: 'foo',
        codeText: 'return x;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0',       isHighlighted: false, line: 1, encodedLocals: {} },
          { funcName: 'foo',  /* no frameId */      isHighlighted: true,  line: 4,
            encodedLocals: { x: ['C_DATA', '0x2000', 'int', 1] } }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    assert.strictEqual(
      trace[1].dsa.diff.scalarUpdates.length, 0,
      'Fix2-B: foo without frameId at depth>0 must NOT report scalar updates (ambiguous continuity)'
    );
  });

  test('Fix2-C: verified prefix normal case still works with matching IDs', () => {
    // prevFrames: [main(f0), foo(f1)]
    // currFrames: [main(f0), foo(f1), bar(f2)] — clean push of bar
    const raw = [
      {
        event: 'stepLine', line: 3, funcName: 'foo',
        codeText: 'bar();',
        stackToRender: [
          { funcName: 'main', frameId: 'f0', isHighlighted: false, line: 1, encodedLocals: { a: ['C_DATA', '0x1000', 'int', 10] } },
          { funcName: 'foo',  frameId: 'f1', isHighlighted: true,  line: 3, encodedLocals: { b: ['C_DATA', '0x2000', 'int', 20] } }
        ],
        heap: {}, deletedAddresses: []
      },
      {
        event: 'stepLine', line: 7, funcName: 'bar',
        codeText: 'return 0;',
        stackToRender: [
          { funcName: 'main', frameId: 'f0', isHighlighted: false, line: 1, encodedLocals: { a: ['C_DATA', '0x1000', 'int', 10] } },
          { funcName: 'foo',  frameId: 'f1', isHighlighted: false, line: 3, encodedLocals: { b: ['C_DATA', '0x2000', 'int', 20] } },
          { funcName: 'bar',  frameId: 'f2', isHighlighted: true,  line: 7, encodedLocals: {} }
        ],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const ft = trace[1].dsa.diff.frameTransition;
    assert.strictEqual(ft.type, 'push', `Fix2-C: Must detect clean push. Got: "${ft.type}"`);
    assert.strictEqual(ft.funcName, 'bar', `Fix2-C: Pushed function must be "bar". Got: "${ft.funcName}"`);
    // No scalar updates (a and b unchanged)
    assert.strictEqual(trace[1].dsa.diff.scalarUpdates.length, 0,
      'Fix2-C: No scalar updates when variables unchanged across clean push');
  });

  // =========================================================================
  // FIX 3 ADVERSARIAL TESTS: Schema-error sentinel uses safe constants;
  // malformed step must not seed delta for the next valid step.
  // =========================================================================

  test('Fix3-A: malformed step produces schema_error with safe constant values', () => {
    // Inject a step with critical missing fields between two valid steps
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'main',
        codeText: 'int x = 5;',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 5,
          encodedLocals: { x: ['C_DATA', '0x1000', 'int', 5] } }],
        heap: {}, deletedAddresses: []
      },
      {
        // Malformed: missing required fields (no funcName, no stackToRender)
        event: 'stepLine'
      },
      {
        event: 'stepLine', line: 7, funcName: 'main',
        codeText: 'int y = 10;',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 7,
          encodedLocals: { x: ['C_DATA', '0x1000', 'int', 5], y: ['C_DATA', '0x1004', 'int', 10] } }],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    // Step 1 (index 1) must be the schema_error sentinel
    const errStep = trace[1];
    assert.strictEqual(errStep.event, 'schema_error',
      `Fix3-A: Malformed step must produce event 'schema_error'. Got: "${errStep.event}"`);
    assert.strictEqual(errStep.line, -1,
      `Fix3-A: schema_error step must have line=-1. Got: ${errStep.line}`);
    assert.strictEqual(errStep.funcName, 'unknown',
      `Fix3-A: schema_error step must have funcName='unknown'. Got: "${errStep.funcName}"`);
    assert.strictEqual(errStep.codeText, '',
      `Fix3-A: schema_error step must have codeText=''. Got: "${errStep.codeText}"`);
    assert.ok(Array.isArray(errStep.dsa.diff.scalarUpdates) && errStep.dsa.diff.scalarUpdates.length === 0,
      'Fix3-A: schema_error step must have empty scalarUpdates');
  });

  test('Fix3-B: invalid trace gap breaks delta continuity (strict negative assertion)', () => {
    // rawTrace: valid(x=5), malformed, valid(x=10)
    // The final valid snapshot must NOT claim the ordinary adjacent transition x: 5 -> 10
    const raw = [
      {
        event: 'stepLine', line: 5, funcName: 'main',
        codeText: 'x = 5;',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 5,
          encodedLocals: { x: ['C_DATA', '0x1000', 'int', 5] } }],
        heap: {}, deletedAddresses: []
      },
      {
        // Malformed step — no funcName, no stackToRender
        event: 'stepLine'
      },
      {
        event: 'stepLine', line: 7, funcName: 'main',
        codeText: 'x = 10;',
        stackToRender: [{ funcName: 'main', frameId: 'f0', isHighlighted: true, line: 7,
          encodedLocals: { x: ['C_DATA', '0x1000', 'int', 10] } }],
        heap: {}, deletedAddresses: []
      }
    ];
    const trace = normalizeTrace(raw);
    const step2 = trace[2];
    assert.strictEqual(step2.event, 'stepLine', `Fix3-B: Step 2 must be a valid stepLine. Got: "${step2.event}"`);
    // STRICT NEGATIVE ASSERTION:
    // Nonadjacent observations must NOT form an ordinary continuous transition across an invalid snapshot.
    assert.strictEqual(
      step2.dsa.diff.scalarUpdates.length, 0,
      `Fix3-B: Step 2 must NOT claim the ordinary adjacent transition x: 5 -> 10 across a schema error gap. Got: ${JSON.stringify(step2.dsa.diff.scalarUpdates)}`
    );
    assert.strictEqual(step2.dsa.diff.changedVariables.length, 0,
      'Fix3-B: Step 2 changedVariables must be empty after invalid trace gap');
    assert.ok(
      !step2.dsa.explanationDetail.observed.includes('thay đổi từ 5 thành 10'),
      `Fix3-B: Observed text must not claim transition from 5 to 10. Got: "${step2.dsa.explanationDetail.observed}"`
    );
    assert.ok(step2.funcName !== 'unknown', 'Fix3-B: Step 2 must NOT inherit schema_error funcName');
  });

  console.log(`Educational Explanations Unit Test Summary: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    const error = new Error('Educational explanations unit tests failed');
    error.summary = { passed, failed, total: passed + failed };
    throw error;
  }
  return { passed, failed, total: passed + failed };
}

if (require.main === module) {
  runEducationalExplanationsTests();
}

module.exports = { runEducationalExplanationsTests };
