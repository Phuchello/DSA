const assert = require('assert');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer.js');

function runNormalizerUnitTests() {
  console.log('='.repeat(70));
  console.log('🧪 Running DSA Normalizer & Pointer Classification Unit Tests');
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
      failed++;
    }
  }

  // 1. Pointer states: null, valid, freed, dangling (confirmed via deletedAddresses), uninitialized, unknown
  test('Classifies null pointer correctly', () => {
    const raw = [{
      event: 'stepLine', line: 10, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
        orderedVarNames: ['p'],
        encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x0'] }
      }],
      heap: {},
      deletedAddresses: []
    }];
    const res = normalizeTrace(raw);
    const p = res[0].dsa.pointers.find(x => x.name === 'p');
    assert.strictEqual(p.state, 'null');
    assert.strictEqual(p.targetAddress, null);
  });

  test('Classifies valid pointer to active heap node correctly', () => {
    const raw = [{
      event: 'stepLine', line: 10, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
        orderedVarNames: ['p'],
        encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x5000'] }
      }],
      heap: {
        '0x5000': ['C_STRUCT', '0x5000', 'NODE', ['info', ['C_DATA', '0x5000', 'int', 42]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      deletedAddresses: []
    }];
    const res = normalizeTrace(raw);
    const p = res[0].dsa.pointers.find(x => x.name === 'p');
    assert.strictEqual(p.state, 'valid');
    assert.strictEqual(p.targetAddress, '0x5000');
  });

  test('Classifies freed pointer (confirmed via deletedAddresses) correctly', () => {
    const raw = [{
      event: 'stepLine', line: 10, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
        orderedVarNames: ['p'],
        encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x5000'] }
      }],
      heap: {},
      deletedAddresses: ['0x5000']
    }];
    const res = normalizeTrace(raw);
    const p = res[0].dsa.pointers.find(x => x.name === 'p');
    assert.strictEqual(p.state, 'freed');
  });

  test('Pointer to address NOT in heap and NOT freed is classified as unknown (not false-positive dangling)', () => {
    // A pointer whose target is not in the heap graph and not in deletedAddresses
    // could be a non-NODE pointer, a library allocation, or an untraceable address.
    // Conservative classification: 'unknown', NOT 'dangling'.
    const raw = [{
      event: 'stepLine', line: 10, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
        orderedVarNames: ['p'],
        encodedLocals: { p: ['C_DATA', '0x1000', 'pointer', '0x999999'] }
      }],
      heap: {},
      deletedAddresses: []
    }];
    const res = normalizeTrace(raw);
    const p = res[0].dsa.pointers.find(x => x.name === 'p');
    // Must be 'unknown' not 'dangling' — we have no evidence it's freed or invalid
    assert.strictEqual(p.state, 'unknown',
      `Expected 'unknown' for unresolved non-freed pointer, got: '${p.state}'`);
  });

  test('Classifies uninitialized pointer correctly', () => {
    const raw = [{
      event: 'stepLine', line: 10, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 10,
        orderedVarNames: ['p'],
        encodedLocals: { p: ['C_DATA', '0x1000', 'uninitialized', '?'] }
      }],
      heap: {},
      deletedAddresses: []
    }];
    const res = normalizeTrace(raw);
    const p = res[0].dsa.pointers.find(x => x.name === 'p');
    assert.strictEqual(p.state, 'uninitialized');
  });

  test('Schema validation error step is emitted for malformed trace input', () => {
    // A completely malformed step (missing required fields) must NOT silently pass through
    const malformedTrace = [{ notEvent: 'foo', noLine: true }];
    const result = normalizeTrace(malformedTrace);
    assert.strictEqual(result.length, 1, 'Malformed step must produce one output entry');
    assert.strictEqual(result[0].event, 'schema_error',
      `Expected event=schema_error, got: ${result[0].event}`);
    assert.ok(result[0].dsa.vietnameseExplanation.includes('Lỗi xác thực'),
      'schema_error must include Vietnamese error message');
  });

  // 2. Multi-root Reachability: allocated (main chain), detached, unreachable, freed
  test('Distinguishes main chain (allocated) vs detached (held by temp) vs unreachable (orphan)', () => {
    const raw = [{
      event: 'stepLine', line: 20, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 20,
        orderedVarNames: ['pHead', 'temp'],
        encodedLocals: {
          pHead: ['C_DATA', '0x10', 'pointer', '0x100'],
          temp: ['C_DATA', '0x18', 'pointer', '0x200']
        }
      }],
      heap: {
        '0x100': ['C_STRUCT', '0x100', 'NODE', ['info', ['C_DATA', '0x100', 'int', 1]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]],
        '0x200': ['C_STRUCT', '0x200', 'NODE', ['info', ['C_DATA', '0x200', 'int', 2]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]],
        '0x300': ['C_STRUCT', '0x300', 'NODE', ['info', ['C_DATA', '0x300', 'int', 3]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]],
        '0x400': ['C_STRUCT', '0x400', 'NODE', ['info', ['C_DATA', '0x400', 'int', 4]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      deletedAddresses: ['0x400']
    }];
    const res = normalizeTrace(raw);
    const nodes = res[0].dsa.nodes;

    const n100 = nodes.find(n => n.address === '0x100');
    const n200 = nodes.find(n => n.address === '0x200');
    const n300 = nodes.find(n => n.address === '0x300');
    const n400 = nodes.find(n => n.address === '0x400');

    assert.strictEqual(n100.status, 'allocated', '0x100 reached from pHead must be allocated');
    assert.strictEqual(n200.status, 'detached', '0x200 reached from temp must be detached');
    assert.strictEqual(n300.status, 'unreachable', '0x300 unreached by any pointer must be unreachable');
    assert.strictEqual(n400.status, 'freed', '0x400 in deletedAddresses must be freed');
  });

  // 3. Stable Object Identity across address reuse
  test('Preserves stable identity and increments generation on address reuse', () => {
    const step1 = {
      event: 'stepLine', line: 5, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 5,
        orderedVarNames: ['pHead'],
        encodedLocals: { pHead: ['C_DATA', '0x10', 'pointer', '0x100'] }
      }],
      heap: {
        '0x100': ['C_STRUCT', '0x100', 'NODE', ['info', ['C_DATA', '0x100', 'int', 10]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      deletedAddresses: []
    };

    const step2 = {
      event: 'stepLine', line: 6, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 6,
        orderedVarNames: ['pHead'],
        encodedLocals: { pHead: ['C_DATA', '0x10', 'pointer', '0x100'] }
      }],
      heap: {},
      deletedAddresses: ['0x100']
    };

    const step3 = {
      event: 'stepLine', line: 7, funcName: 'main',
      stackToRender: [{
        funcName: 'main', frameId: 'f0', isHighlighted: true, line: 7,
        orderedVarNames: ['pHead'],
        encodedLocals: { pHead: ['C_DATA', '0x10', 'pointer', '0x100'] }
      }],
      heap: {
        '0x100': ['C_STRUCT', '0x100', 'NODE', ['info', ['C_DATA', '0x100', 'int', 20]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      deletedAddresses: []
    };

    const res = normalizeTrace([step1, step2, step3]);

    const n1 = res[0].dsa.nodes.find(n => n.address === '0x100');
    assert.strictEqual(n1.id, 'node_0x100_gen1');
    assert.strictEqual(n1.status, 'allocated');

    const n2 = res[1].dsa.nodes.find(n => n.address === '0x100');
    assert.strictEqual(n2.id, 'node_0x100_gen1');
    assert.strictEqual(n2.status, 'freed');

    const n3 = res[2].dsa.nodes.find(n => n.address === '0x100');
    assert.strictEqual(n3.id, 'node_0x100_gen2', 'Reused address must get gen2 ID');
    assert.strictEqual(n3.status, 'allocated');
  });


  test('Preserves same-named pointer instances across caller and recursive frames', () => {
    const raw = [{
      event: 'call',
      line: 4,
      funcName: 'SumList',
      stackToRender: [
        {
          funcName: 'main', frameId: 'main-frame', frameDepth: 0, isHighlighted: false,
          encodedLocals: {
            p: ['C_DATA', '0x10', 'uninitialized', '?'],
            L: ['C_STRUCT', '0x20', 'LIST', ['pHead', ['C_DATA', '0x20', 'pointer', '0x100']]]
          }
        },
        {
          funcName: 'SumList', frameId: 'sum-frame-1', frameDepth: 1, isHighlighted: false,
          encodedLocals: { p: ['C_DATA', '0x30', 'pointer', '0x100'] }
        },
        {
          funcName: 'SumList', frameId: 'sum-frame-2', frameDepth: 2, isHighlighted: true,
          encodedLocals: { p: ['C_DATA', '0x40', 'pointer', '0x200'] }
        }
      ],
      heap: {
        '0x100': ['C_STRUCT', '0x100', 'NODE', ['info', ['C_DATA', '0x100', 'int', 1]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]],
        '0x200': ['C_STRUCT', '0x200', 'NODE', ['info', ['C_DATA', '0x200', 'int', 2]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      stackNodes: {},
      deletedAddresses: []
    }];

    const point = normalizeTrace(raw)[0];
    const pInstances = point.dsa.pointers.filter(pointer => pointer.name === 'p');
    assert.strictEqual(pInstances.length, 3, 'Caller and both recursive frames must retain their own p');
    assert.strictEqual(pInstances.find(pointer => pointer.frameId === 'main-frame').state, 'uninitialized');
    assert.strictEqual(pInstances.find(pointer => pointer.frameId === 'sum-frame-1').targetAddress, '0x100');
    assert.strictEqual(pInstances.find(pointer => pointer.frameId === 'sum-frame-2').targetAddress, '0x200');
    assert.strictEqual(new Set(pInstances.map(pointer => pointer.displayName)).size, 3,
      'Canvas labels must distinguish pointer instances by frame');
    assert.strictEqual(point.dsa.mainChain[0].address, '0x100',
      'The caller LIST root must remain the first node in the main chain');
  });

  test('Keeps caller uninitialized p separate from live CreateNode local p', () => {
    const point = normalizeTrace([{
      event: 'call', line: 7, funcName: 'CreateNode',
      stackToRender: [
        {
          funcName: 'main', frameId: 'main-call', frameDepth: 0,
          encodedLocals: { p: ['C_DATA', '0x10', 'uninitialized', '?'] }
        },
        {
          funcName: 'CreateNode', frameId: 'create-local', frameDepth: 1,
          encodedLocals: { p: ['C_DATA', '0x20', 'pointer', '0x5000'] }
        }
      ],
      heap: {
        '0x5000': ['C_STRUCT', '0x5000', 'NODE', ['info', ['C_DATA', '0x5000', 'int', 42]], ['pNext', ['C_DATA', '0x0', 'pointer', '0x0']]]
      },
      stackNodes: {},
      deletedAddresses: []
    }])[0];

    const callerPointer = point.dsa.pointers.find(pointer => pointer.frameId === 'main-call' && pointer.name === 'p');
    const localPointer = point.dsa.pointers.find(pointer => pointer.frameId === 'create-local' && pointer.name === 'p');
    assert.strictEqual(callerPointer?.state, 'uninitialized');
    assert.strictEqual(localPointer?.state, 'valid');
    assert.strictEqual(localPointer?.targetAddress, '0x5000');
    assert.notStrictEqual(callerPointer?.displayName, localPointer?.displayName);
    assert.strictEqual(point.dsa.mainChain.length, 0);
  });

  console.log(`Unit Test Summary: ${passed} PASS, ${failed} FAIL`);
  const summary = { passed, failed, total: passed + failed };
  if (failed > 0) {
    const error = new Error('Normalizer unit tests failed');
    error.summary = summary;
    throw error;
  }
  return summary;
}

if (require.main === module) {
  runNormalizerUnitTests();
}

module.exports = { runNormalizerUnitTests };
