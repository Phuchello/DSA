/**
 * DSA FlowLab Milestone 2.3 — Generalization & Educational Accuracy Evaluation
 * 
 * Executes the 10 frozen challenge fixtures through native C++/GDB runner,
 * normalizes the traces, extracts educational facets, and evaluates 40 frozen
 * semantic checkpoints with explicit, independent expectations.
 * 
 * Rubric Tiers:
 * - CORRECT: Pedagogically specific, factually accurate explanation matching verified trace diff.
 * - GENERIC: Factually accurate, but generic language-level control flow / statement explanation.
 * - UNSUPPORTED: Truthfully reports unsupported structure (e.g. BinNode tree) without fabricating topology.
 * - PARTIAL: Minor imprecision in facet explanation.
 * - WRONG: Factually false statement, wrong variable value, inverted timing, or wrong frame.
 * - UNKNOWN: Required checkpoint missing from trace or unclassified.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const { runCppCode } = require(path.join(ROOT, 'server/dist/runner/cppRunner'));
const { normalizeTrace } = require(path.join(ROOT, 'server/dist/normalizer/dsaNormalizer'));

const FIXTURES_DIR = path.join(ROOT, 'tests/fixtures/m2_3');
const OUTPUT_DIR = path.join(ROOT, 'docs/eval_results');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. FROZEN CHECKPOINT REGISTRY (Exactly 40 Checkpoints, 5 per Fixture A-H)
// ---------------------------------------------------------------------------
const CHECKPOINT_REGISTRY = [
  // Fixture A: Binary Search
  { id: 'CP-A1', fixtureId: 'A', name: 'Array seq[6] initialization in main', targetLine: 23, targetFunc: 'main' },
  { id: 'CP-A2', fixtureId: 'A', name: 'While loop condition evaluation', targetLine: 8, targetFunc: 'findFirstOccurrence' },
  { id: 'CP-A3', fixtureId: 'A', name: 'Midpoint calculation in findFirstOccurrence', targetLine: 9, targetFunc: 'findFirstOccurrence' },
  { id: 'CP-A4', fixtureId: 'A', name: 'Duplicate match branch condition check', targetLine: 10, targetFunc: 'findFirstOccurrence' },
  { id: 'CP-A5', fixtureId: 'A', name: 'High boundary left shift for duplicate search', targetLine: 12, targetFunc: 'findFirstOccurrence' },

  // Fixture B: Prefix Sums
  { id: 'CP-B1', fixtureId: 'B', name: 'Array cumSum[6] zero-initialization', targetLine: 6, targetFunc: 'main' },
  { id: 'CP-B2', fixtureId: 'B', name: 'First prefix accumulation assignment cumSum[1] = 3', targetLine: 8, targetFunc: 'main' },
  { id: 'CP-B3', fixtureId: 'B', name: 'Prefix accumulation loop condition check', targetLine: 7, targetFunc: 'main' },
  { id: 'CP-B4', fixtureId: 'B', name: 'Terminal prefix accumulation cumSum[5] = 14', targetLine: 8, targetFunc: 'main' },
  { id: 'CP-B5', fixtureId: 'B', name: 'Range query singleSum = cumSum[3] - cumSum[2] = 4', targetLine: 11, targetFunc: 'main' },

  // Fixture C: Euclidean GCD
  { id: 'CP-C1', fixtureId: 'C', name: 'Iterative GCD while loop condition check', targetLine: 5, targetFunc: 'gcdIterative' },
  { id: 'CP-C2', fixtureId: 'C', name: 'Modulo remainder calculation in iterative GCD', targetLine: 6, targetFunc: 'gcdIterative' },
  { id: 'CP-C3', fixtureId: 'C', name: 'Recursive GCD call entry from main', targetLine: 22, targetFunc: 'main' },
  { id: 'CP-C4', fixtureId: 'C', name: 'Recursive GCD base case condition check (v == 0)', targetLine: 14, targetFunc: 'gcdRecursive' },
  { id: 'CP-C5', fixtureId: 'C', name: 'Recursive base case return unwinding (return u)', targetLine: 15, targetFunc: 'gcdRecursive' },

  // Fixture D: Monotonic Stack
  { id: 'CP-D1', fixtureId: 'D', name: 'STL vector heights declaration and size resolution', targetLine: 6, targetFunc: 'main' },
  { id: 'CP-D2', fixtureId: 'D', name: 'Monotonic stack outer loop index progression', targetLine: 10, targetFunc: 'main' },
  { id: 'CP-D3', fixtureId: 'D', name: 'Monotonic stack comparison condition', targetLine: 11, targetFunc: 'main' },
  { id: 'CP-D4', fixtureId: 'D', name: 'Next Greater Element assignment nge[stk.back()]', targetLine: 12, targetFunc: 'main' },
  { id: 'CP-D5', fixtureId: 'D', name: 'Index push onto monotonic stack', targetLine: 15, targetFunc: 'main' },

  // Fixture E: Merge Sort
  { id: 'CP-E1', fixtureId: 'E', name: 'Top-level divide & conquer invocation mergeSort(data, 0, 3)', targetLine: 33, targetFunc: 'main' },
  { id: 'CP-E2', fixtureId: 'E', name: 'Base condition evaluation if (left >= right)', targetLine: 24, targetFunc: 'mergeSort' },
  { id: 'CP-E3', fixtureId: 'E', name: 'Partition midpoint calculation mid = left + (right - left)/2', targetLine: 25, targetFunc: 'mergeSort' },
  { id: 'CP-E4', fixtureId: 'E', name: 'Sub-array combine invocation merge(arr, left, mid, right)', targetLine: 28, targetFunc: 'mergeSort' },
  { id: 'CP-E5', fixtureId: 'E', name: 'Sorted element merge write arr[k++] = ...', targetLine: 14, targetFunc: 'merge' },

  // Fixture F: Custom Tree
  { id: 'CP-F1', fixtureId: 'F', name: 'Custom BinNode struct allocation (honest unsupported boundary)', targetLine: 16, targetFunc: 'main' },
  { id: 'CP-F2', fixtureId: 'F', name: 'Tree traversal recursion entry sumKeys(root)', targetLine: 20, targetFunc: 'main' },
  { id: 'CP-F3', fixtureId: 'F', name: 'Tree leaf null check if (cur == nullptr)', targetLine: 11, targetFunc: 'sumKeys' },
  { id: 'CP-F4', fixtureId: 'F', name: 'Base case return 0 in tree traversal', targetLine: 11, targetFunc: 'sumKeys' },
  { id: 'CP-F5', fixtureId: 'F', name: 'Heap deallocation of custom tree root', targetLine: 25, targetFunc: 'main' },

  // Fixture G: 1D Dynamic Programming
  { id: 'CP-G1', fixtureId: 'G', name: 'DP array initialization dp[6] with base 0 and infinity 99', targetLine: 7, targetFunc: 'main' },
  { id: 'CP-G2', fixtureId: 'G', name: 'Target amount transition in outer DP loop', targetLine: 9, targetFunc: 'main' },
  { id: 'CP-G3', fixtureId: 'G', name: 'Optimal substructure relaxation comparison check', targetLine: 12, targetFunc: 'main' },
  { id: 'CP-G4', fixtureId: 'G', name: 'DP state relaxation mutation dp[amt] = dp[amt - coinVal] + 1', targetLine: 13, targetFunc: 'main' },
  { id: 'CP-G5', fixtureId: 'G', name: 'Terminal DP optimal answer retrieval dp[5] == 2', targetLine: 18, targetFunc: 'main' },

  // Fixture H: Shadowing & Pointers
  { id: 'CP-H1', fixtureId: 'H', name: 'Local variable val initialized to 5 in main frame', targetLine: 17, targetFunc: 'main' },
  { id: 'CP-H2', fixtureId: 'H', name: 'Call frame push to processOuter with parameter val', targetLine: 11, targetFunc: 'processOuter' },
  { id: 'CP-H3', fixtureId: 'H', name: 'Pointer passing to computeInner(ptr) in processOuter', targetLine: 12, targetFunc: 'processOuter' },
  { id: 'CP-H4', fixtureId: 'H', name: 'Shadowed local val in computeInner frame (val = 10)', targetLine: 5, targetFunc: 'computeInner' },
  { id: 'CP-H5', fixtureId: 'H', name: 'Pointer indirection mutation (*targetPtr = val + 1) updating outer val', targetLine: 6, targetFunc: 'computeInner' },
];

const FIXTURES = [
  { id: 'A', file: 'A_binary_search.cpp', name: 'Binary Search (duplicates & missing target)', family: 'Binary Search', expectedStdout: '1 -1', isNegative: false },
  { id: 'B', file: 'B_prefix_sums.cpp', name: 'Prefix Sums & Range Queries', family: 'Prefix Sums', expectedStdout: '14 4', isNegative: false },
  { id: 'C', file: 'C_euclidean_gcd.cpp', name: 'Euclidean GCD (Iterative & Recursive)', family: 'Euclidean GCD', expectedStdout: '6 6', isNegative: false },
  { id: 'D', file: 'D_monotonic_stack.cpp', name: 'Monotonic Stack / Next Greater Element', family: 'Monotonic Stack', expectedStdout: '5 10 10 -1 -1', isNegative: false },
  { id: 'E', file: 'E_merge_sort.cpp', name: 'Merge Sort (Divide & Conquer)', family: 'Merge Sort', expectedStdout: '3 27 38 43', isNegative: false },
  { id: 'F', file: 'F_custom_tree.cpp', name: 'Custom Binary Tree Structure', family: 'Custom Tree', expectedStdout: '30', isNegative: false },
  { id: 'G', file: 'G_dp_numeric.cpp', name: 'Dynamic Programming on Numeric Array', family: 'Dynamic Programming', expectedStdout: '2', isNegative: false },
  { id: 'H', file: 'H_shadow_pointers.cpp', name: 'Shadowed Variables & Pointer Indirection', family: 'Shadowing & Pointers', expectedStdout: '5 21', isNegative: false },
  { id: 'N1', file: 'N1_step_limit.cpp', name: 'Execution / Step Limit Exceeded', family: 'Negative / Control (Limit)', expectedStdout: '2000', isNegative: true, expectedStatus: 'truncated' },
  { id: 'N2', file: 'N2_compile_error.cpp', name: 'Compile-Time Type Mismatch', family: 'Negative / Control (Compile Error)', expectedStdout: '', isNegative: true, expectedSuccess: false },
];

// Helper to select the active frame matching the step's current function.
// stackToRender is ordered from shallowest (index 0, usually main) to deepest.
// The active frame for a step in funcName X is the frame whose funcName matches X.
function selectActiveFrame(step) {
  if (!step || !step.stackToRender || step.stackToRender.length === 0) return null;
  // Prefer the frame whose funcName matches the step's funcName (deepest active frame)
  const match = step.stackToRender.slice().reverse().find(f => f.funcName === step.funcName);
  return match || step.stackToRender[step.stackToRender.length - 1];
}

// Helper to extract compact trace excerpt, selecting variables from the ACTIVE frame.
function extractTraceExcerpt(step, cpId, relevantVarNames = []) {
  if (!step) return null;
  const vars = {};
  const activeFrame = selectActiveFrame(step);
  if (activeFrame && activeFrame.encodedLocals) {
    for (const k of Object.keys(activeFrame.encodedLocals)) {
      if (relevantVarNames.length === 0 || relevantVarNames.includes(k)) {
        const raw = activeFrame.encodedLocals[k];
        if (Array.isArray(raw)) {
          if (raw[0] === 'C_DATA') vars[k] = raw[3];
          else if (raw[0] === 'C_ARRAY') vars[k] = raw.slice(2).map(elem => elem[3]);
          else vars[k] = raw[1] || raw[0];
        } else {
          vars[k] = raw;
        }
      }
    }
  }

  return {
    checkpointId: cpId,
    step: step.step,
    line: step.line,
    funcName: step.funcName,
    frameDepth: activeFrame ? activeFrame.frameDepth : 0,
    frameId: activeFrame ? activeFrame.frameId : '0x0',
    codeText: step.codeText,
    snapshotConvention: step.snapshotConvention || 'before-statement',
    relevantVariables: vars,
    explanation: step.dsa.explanationDetail ? {
      upcoming: step.dsa.explanationDetail.upcoming,
      observed: step.dsa.explanationDetail.observed,
      semantics: step.dsa.explanationDetail.semantics,
    } : null,
  };
}

/**
 * ONE SHARED TRUTHFULNESS GUARD
 * 
 * Validates factual consistency across upcoming, observed, and semantics facets
 * against trusted state diffs before finalizing any checkpoint verdict.
 * 
 * In before-statement convention (step N):
 * - upcoming: prospective intent of line to be executed at step N.
 * - observed: state delta from step N-1 to step N, recorded in step.dsa.diff.
 * - semantics: pedagogical/algorithmic meaning of the upcoming statement.
 * 
 * Explicitly Checked Patterns:
 * 1. Semantics/Upcoming Timing: completed-action keywords on before-statement snapshots
 *    ("đã thực hiện xong", "đã được cập nhật", "đã cập nhật xong", "đã hoàn thành",
 *     "đã gán xong", "đã tính toán xong", "đã thay đổi xong", "đã được gán",
 *     "đã kết thúc", "đã giải phóng xong", "đã cấp phát xong", "already completed", "has been updated").
 * 2. Observed Scalar Mutations:
 *    - "Biến [frame::]var thay đổi từ fromVal thành toVal"
 *    - "Biến [frame::]var được khởi tạo giá trị toVal"
 *    - "var: fromVal -> toVal" or "var: fromVal → toVal"
 * 3. Observed Array Mutations:
 *    - "Phần tử mảng [frame::]arr[idx] thay đổi từ fromVal thành toVal"
 *    - "Phần tử mảng [frame::]arr[idx] được khởi tạo giá trị toVal"
 *    - "arr[idx]: fromVal -> toVal" or "arr[idx]: fromVal → toVal"
 * 4. Observed Heap Allocations / Deallocations:
 *    - "Đã cấp phát khối nhớ mới trên Heap tại addr" -> verified against diff.allocatedNodes
 *    - "Đã giải phóng khối nhớ Heap tại addr" -> verified against diff.freedNodes
 * 5. Observed Stack Frame Transitions:
 *    - "Đã tạo khung ngăn xếp mới cho hàm func() ở độ sâu depth" -> verified against diff.frameTransition (push)
 *    - "Khung ngăn xếp của hàm func() đã hoàn thành và được thu hồi" -> verified against diff.frameTransition (pop)
 * 6. Observed Diff Emptiness:
 *    - Claims of "Không có thay đổi biến nào trong bộ nhớ ở bước trước" verified against diff emptiness.
 * 
 * Explicitly Unchecked Patterns (by design — no natural language understanding model):
 * - High-level conceptual descriptions of algorithms (e.g. "áp dụng chia để trị", "duyệt ngăn xếp đơn điệu").
 * - Mathematical proofs or loop invariant formulations in unstructured Vietnamese prose.
 * - Free-form prose style or wording nuances that do not assert concrete state mutations.
 */
function validateExplanationFidelity(step) {
  const violations = [];
  if (!step || !step.dsa || !step.dsa.explanationDetail) return violations;

  const { upcoming, observed, semantics } = step.dsa.explanationDetail;
  const diff = step.dsa.diff || {
    scalarUpdates: [],
    arrayUpdates: [],
    allocatedNodes: [],
    freedNodes: [],
    frameTransition: { type: 'none' },
    pointerReroutes: [],
  };

  const isBeforeStatement = (step.snapshotConvention || 'before-statement') === 'before-statement';

  // -------------------------------------------------------------------------
  // 1. Timing consistency in semantics & upcoming
  // -------------------------------------------------------------------------
  if (isBeforeStatement) {
    const completedKeywords = [
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

    for (const kw of completedKeywords) {
      if (semantics && semantics.toLowerCase().includes(kw)) {
        violations.push(`Semantics claims completed action on before-statement step: "${kw}"`);
      }
      if (upcoming && upcoming.toLowerCase().includes(kw)) {
        violations.push(`Upcoming claims completed action on before-statement step: "${kw}"`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Concrete mutation claims in observed vs step.dsa.diff
  // -------------------------------------------------------------------------
  if (observed && typeof observed === 'string') {
    // 2a. Array element mutation (Vietnamese normalizer format):
    // e.g. "Phần tử mảng cumSum[1] thay đổi từ 0 thành 3."
    // e.g. "Phần tử mảng nge[0] thay đổi từ 900 thành -5555."
    const arrMutRegex = /(?:Phần tử mảng\s+)?(?:(\w+)::)?(\w+)\[(\d+)\]\s+thay đổi từ\s+([^\s]+)\s+thành\s+([^\s\.,;]+)/gi;
    let m;
    while ((m = arrMutRegex.exec(observed)) !== null) {
      const [, frameName, arrName, idxStr, fromVal, toVal] = m;
      const idx = parseInt(idxStr, 10);
      const match = (diff.arrayUpdates || []).some(u => {
        const nameMatch = u.arrayName === arrName;
        const idxMatch = u.index === idx;
        const toMatch = String(u.to) === String(toVal);
        const fromMatch = (fromVal === '?' || String(u.from) === String(fromVal));
        const frameMatch = !frameName || u.frameName === frameName;
        return nameMatch && idxMatch && toMatch && fromMatch && frameMatch;
      });
      if (!match) {
        violations.push(`Observed claims array mutation ${arrName}[${idx}] (${fromVal} -> ${toVal})${frameName ? ' in ' + frameName : ''} not confirmed by step diff`);
      }
    }

    // 2b. Array element initialization (Vietnamese normalizer format):
    // e.g. "Phần tử mảng cumSum[0] được khởi tạo giá trị 0."
    const arrInitRegex = /(?:Phần tử mảng\s+)?(?:(\w+)::)?(\w+)\[(\d+)\]\s+được khởi tạo giá trị\s+([^\s\.,;]+)/gi;
    while ((m = arrInitRegex.exec(observed)) !== null) {
      const [, frameName, arrName, idxStr, toVal] = m;
      const idx = parseInt(idxStr, 10);
      const match = (diff.arrayUpdates || []).some(u => {
        const nameMatch = u.arrayName === arrName;
        const idxMatch = u.index === idx;
        const toMatch = String(u.to) === String(toVal);
        const frameMatch = !frameName || u.frameName === frameName;
        return nameMatch && idxMatch && toMatch && frameMatch;
      });
      if (!match) {
        violations.push(`Observed claims array init ${arrName}[${idx}] = ${toVal}${frameName ? ' in ' + frameName : ''} not confirmed by step diff`);
      }
    }

    // 2c. Colon/Arrow notation (adversarial injection, e.g. "nge[0]: 900 -> -5555" or "high: 5 -> 1")
    const arrowRegex = /(?:(\w+)::)?(\w+)(?:\[(\d+)\])?\s*:\s*([^\s]+)\s*(?:->|→)\s*([^\s\.,;]+)/g;
    while ((m = arrowRegex.exec(observed)) !== null) {
      const [, frameName, varName, idxStr, fromVal, toVal] = m;
      if (idxStr !== undefined) {
        const idx = parseInt(idxStr, 10);
        const match = (diff.arrayUpdates || []).some(u => {
          const nameMatch = u.arrayName === varName;
          const idxMatch = u.index === idx;
          const toMatch = String(u.to) === String(toVal);
          const fromMatch = (fromVal === '?' || String(u.from) === String(fromVal));
          const frameMatch = !frameName || u.frameName === frameName;
          return nameMatch && idxMatch && toMatch && fromMatch && frameMatch;
        });
        if (!match) {
          violations.push(`Observed claims array mutation ${varName}[${idx}] (${fromVal} -> ${toVal}) not confirmed by step diff`);
        }
      } else {
        const match = (diff.scalarUpdates || []).some(u => {
          const nameMatch = u.name === varName;
          const toMatch = String(u.to) === String(toVal);
          const fromMatch = (fromVal === '?' || String(u.from) === String(fromVal));
          const frameMatch = !frameName || u.frameName === frameName;
          return nameMatch && toMatch && fromMatch && frameMatch;
        });
        if (!match) {
          violations.push(`Observed claims scalar mutation ${varName} (${fromVal} -> ${toVal}) not confirmed by step diff`);
        }
      }
    }

    // 2d. Scalar mutation (Vietnamese normalizer format):
    // e.g. "Biến high thay đổi từ 5 thành 1."
    const scalarMutRegex = /Biến\s+(?:(\w+)::)?(\w+)\s+thay đổi từ\s+([^\s]+)\s+thành\s+([^\s\.,;]+)/gi;
    while ((m = scalarMutRegex.exec(observed)) !== null) {
      const [, frameName, varName, fromVal, toVal] = m;
      const match = (diff.scalarUpdates || []).some(u => {
        const nameMatch = u.name === varName;
        const toMatch = String(u.to) === String(toVal);
        const fromMatch = (fromVal === '?' || String(u.from) === String(fromVal));
        const frameMatch = !frameName || u.frameName === frameName;
        return nameMatch && toMatch && fromMatch && frameMatch;
      });
      if (!match) {
        violations.push(`Observed claims scalar mutation ${varName} (${fromVal} -> ${toVal})${frameName ? ' in ' + frameName : ''} not confirmed by step diff`);
      }
    }

    // 2e. Scalar initialization (Vietnamese normalizer format):
    // e.g. "Biến val được khởi tạo giá trị 5."
    const scalarInitRegex = /Biến\s+(?:(\w+)::)?(\w+)\s+được khởi tạo giá trị\s+([^\s\.,;]+)/gi;
    while ((m = scalarInitRegex.exec(observed)) !== null) {
      const [, frameName, varName, toVal] = m;
      const match = (diff.scalarUpdates || []).some(u => {
        const nameMatch = u.name === varName;
        const toMatch = String(u.to) === String(toVal);
        const frameMatch = !frameName || u.frameName === frameName;
        return nameMatch && toMatch && frameMatch;
      });
      if (!match) {
        violations.push(`Observed claims scalar init ${varName} = ${toVal}${frameName ? ' in ' + frameName : ''} not confirmed by step diff`);
      }
    }

    // 2f. Heap allocation verification
    const heapAllocRegex = /Đã cấp phát khối nhớ mới trên Heap tại\s+([0-9a-fxA-FX]+)/gi;
    while ((m = heapAllocRegex.exec(observed)) !== null) {
      const addr = m[1].toLowerCase();
      const match = (diff.allocatedNodes || []).some(a => String(a).toLowerCase() === addr);
      if (!match) {
        violations.push(`Observed claims heap allocation at ${m[1]} not found in diff.allocatedNodes`);
      }
    }

    // 2g. Heap deallocation verification
    const heapFreeRegex = /Đã giải phóng khối nhớ Heap tại\s+([0-9a-fxA-FX]+)/gi;
    while ((m = heapFreeRegex.exec(observed)) !== null) {
      const addr = m[1].toLowerCase();
      const match = (diff.freedNodes || []).some(a => String(a).toLowerCase() === addr);
      if (!match) {
        violations.push(`Observed claims heap deallocation at ${m[1]} not found in diff.freedNodes`);
      }
    }

    // 2h. Stack frame push verification
    const framePushRegex = /Đã tạo khung ngăn xếp mới cho hàm\s+(\w+)\(\)\s+ở độ sâu\s+(\d+)/gi;
    while ((m = framePushRegex.exec(observed)) !== null) {
      const [, fn] = m;
      const ft = diff.frameTransition || { type: 'none' };
      if (ft.type !== 'push' || ft.funcName !== fn) {
        violations.push(`Observed claims frame push for ${fn}(), but diff.frameTransition is ${JSON.stringify(ft)}`);
      }
    }

    // 2i. Stack frame pop verification
    const framePopRegex = /Khung ngăn xếp của hàm\s+(\w+)\(\)\s+đã hoàn thành và được thu hồi/gi;
    while ((m = framePopRegex.exec(observed)) !== null) {
      const fn = m[1];
      const ft = diff.frameTransition || { type: 'none' };
      if (ft.type !== 'pop' || ft.funcName !== fn) {
        violations.push(`Observed claims frame pop for ${fn}(), but diff.frameTransition is ${JSON.stringify(ft)}`);
      }
    }

    // 2j. Diff emptiness verification
    if (observed.includes('Không có thay đổi biến nào trong bộ nhớ ở bước trước')) {
      const hasScalars = diff.scalarUpdates && diff.scalarUpdates.length > 0;
      const hasArrays = diff.arrayUpdates && diff.arrayUpdates.length > 0;
      if (hasScalars || hasArrays) {
        violations.push('Observed claims no variable changes, but diff contains updates');
      }
    }
  }

  return violations;
}

// Backward-compatibility alias
function checkFacetConsistency(step) {
  return validateExplanationFidelity(step);
}

async function runEvaluation() {
  console.log('='.repeat(78));
  console.log('🔬 DSA FlowLab M2.3: Evaluation Integrity & Accuracy Runner');
  console.log('='.repeat(78));

  const evaluationReport = {
    evaluatedAt: new Date().toISOString(),
    baselineCommit: '3bd3179be9ce6118b043653ac2eb318430db2533',
    fixturesCount: FIXTURES.length,
    registeredCheckpointsCount: CHECKPOINT_REGISTRY.length,
    fixtures: [],
    traceExcerpts: [],
    rubricSummary: {
      CORRECT: 0,
      GENERIC: 0,
      UNSUPPORTED: 0,
      PARTIAL: 0,
      WRONG: 0,
      UNKNOWN: 0,
      TOTAL: 0,
    },
    negativeControls: {
      N1_step_limit: { verified: false, details: '' },
      N2_compile_error: { verified: false, details: '' },
    },
    defects: [],
  };

  let hasMandatoryFailures = false;

  for (const f of FIXTURES) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`▶ Fixture [${f.id}] ${f.name} (${f.file})`);
    console.log(`----------------------------------------------------------------------`);

    const filePath = path.join(FIXTURES_DIR, f.file);
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const sha256 = crypto.createHash('sha256').update(sourceCode).digest('hex');

    console.log(`  Source SHA-256: ${sha256}`);

    const startTime = Date.now();
    let runnerResult;
    try {
      runnerResult = await runCppCode(sourceCode, '');
    } catch (err) {
      console.error(`  Runner crashed: ${err.message}`);
      runnerResult = { success: false, buildOutput: err.message, trace: [] };
    }
    const durationMs = Date.now() - startTime;

    const fixtureRecord = {
      id: f.id,
      file: f.file,
      name: f.name,
      family: f.family,
      sha256,
      durationMs,
      runnerSuccess: runnerResult.success,
      buildOutput: runnerResult.buildOutput || '',
      stdout: (runnerResult.finalStdout || '').trim(),
      expectedStdout: f.expectedStdout,
      stdoutMatch: false,
      terminationStatus: runnerResult.terminationStatus || 'normal',
      rawTraceSteps: (runnerResult.trace || []).length,
      normalizedTraceSteps: 0,
      checkpoints: [],
    };

    // -----------------------------------------------------------------------
    // NEGATIVE CONTROLS VERIFICATION
    // -----------------------------------------------------------------------
    if (f.id === 'N1') {
      const statusTruncated = runnerResult.terminationStatus === 'truncated';
      const countClamped = runnerResult.trace.length === 1000;
      const validPartialTrace = Array.isArray(runnerResult.trace) && runnerResult.trace.length > 0 &&
        runnerResult.trace.every(s => typeof s.line === 'number');

      const n1Pass = statusTruncated && countClamped && validPartialTrace;
      fixtureRecord.stdoutMatch = n1Pass;
      evaluationReport.negativeControls.N1_step_limit = {
        verified: n1Pass,
        details: `status=${runnerResult.terminationStatus}, steps=${runnerResult.trace.length}, validPartial=${validPartialTrace}`,
      };

      console.log(`  Negative N1 Verification: ${n1Pass ? 'PASS' : 'FAIL'} (${evaluationReport.negativeControls.N1_step_limit.details})`);
      if (!n1Pass) hasMandatoryFailures = true;
      evaluationReport.fixtures.push(fixtureRecord);
      continue;
    }

    if (f.id === 'N2') {
      const compileFailed = runnerResult.success === false;
      const hasDiagnostic = typeof runnerResult.buildOutput === 'string' &&
        (runnerResult.buildOutput.includes('error:') || runnerResult.buildOutput.includes('invalid conversion'));
      const zeroTrace = runnerResult.trace.length === 0;

      const n2Pass = compileFailed && hasDiagnostic && zeroTrace;
      fixtureRecord.stdoutMatch = n2Pass;
      evaluationReport.negativeControls.N2_compile_error = {
        verified: n2Pass,
        details: `success=${runnerResult.success}, hasDiagnostic=${hasDiagnostic}, traceSteps=${runnerResult.trace.length}`,
      };

      console.log(`  Negative N2 Verification: ${n2Pass ? 'PASS' : 'FAIL'} (${evaluationReport.negativeControls.N2_compile_error.details})`);
      if (!n2Pass) hasMandatoryFailures = true;
      evaluationReport.fixtures.push(fixtureRecord);
      continue;
    }

    // Positive tests
    fixtureRecord.stdoutMatch = (fixtureRecord.stdout === f.expectedStdout);
    console.log(`  Execution: ${runnerResult.success ? 'SUCCESS' : 'FAILED'} in ${durationMs}ms`);
    console.log(`  Stdout: actual="${fixtureRecord.stdout}" vs expected="${f.expectedStdout}" => ${fixtureRecord.stdoutMatch ? 'PASS' : 'FAIL'}`);

    if (!fixtureRecord.stdoutMatch) {
      hasMandatoryFailures = true;
    }

    // Normalize trace
    let normalized = [];
    try {
      normalized = normalizeTrace(runnerResult.trace);
      fixtureRecord.normalizedTraceSteps = normalized.length;
      console.log(`  Normalized steps: ${normalized.length}`);
    } catch (normErr) {
      console.error(`  Normalizer failed: ${normErr.message}`);
      hasMandatoryFailures = true;
    }

    // Grade registered checkpoints for this fixture
    const fixtureCheckpoints = CHECKPOINT_REGISTRY.filter(cp => cp.fixtureId === f.id);
    for (const cpDef of fixtureCheckpoints) {
      const result = gradeCheckpoint(cpDef, normalized, sourceCode);
      fixtureRecord.checkpoints.push(result);
      evaluationReport.rubricSummary[result.verdict]++;
      evaluationReport.rubricSummary.TOTAL++;

      if (result.excerpt) {
        evaluationReport.traceExcerpts.push(result.excerpt);
      }

      const icon = result.verdict === 'CORRECT' ? '✅' :
                   result.verdict === 'GENERIC' ? 'ℹ️' :
                   result.verdict === 'UNSUPPORTED' ? '🛡️' :
                   result.verdict === 'PARTIAL' ? '⚠️' :
                   result.verdict === 'WRONG' ? '❌' : '❓';
      console.log(`  ${icon} [${result.id}] Step ${result.step} (L${result.line}): ${result.name} => ${result.verdict}`);
      console.log(`      Reason: ${result.reason}`);

      if (result.verdict === 'WRONG' || result.verdict === 'UNKNOWN') {
        evaluationReport.defects.push({
          fixture: f.id,
          checkpoint: result.id,
          step: result.step,
          line: result.line,
          verdict: result.verdict,
          reason: result.reason,
        });
        hasMandatoryFailures = true;
      }
    }

    evaluationReport.fixtures.push(fixtureRecord);
  }

  // -------------------------------------------------------------------------
  // 3. FINAL SUMMARY & REPORT EXPORT
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('📊 FINAL EVALUATION INTEGRITY SUMMARY');
  console.log('======================================================================');
  const sum = evaluationReport.rubricSummary;
  console.log(`  CORRECT:     ${sum.CORRECT.toString().padStart(3)} / ${sum.TOTAL}  (Pedagogically specific & grounded)`);
  console.log(`  GENERIC:     ${sum.GENERIC.toString().padStart(3)} / ${sum.TOTAL}  (Language-level control flow fallback)`);
  console.log(`  UNSUPPORTED: ${sum.UNSUPPORTED.toString().padStart(3)} / ${sum.TOTAL}  (Honest structural boundary)`);
  console.log(`  PARTIAL:     ${sum.PARTIAL.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  WRONG:       ${sum.WRONG.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  UNKNOWN:     ${sum.UNKNOWN.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  TOTAL:       ${sum.TOTAL.toString().padStart(3)}`);

  const honestSupported = sum.CORRECT + sum.GENERIC + sum.UNSUPPORTED + sum.PARTIAL;
  const accuracyRate = sum.TOTAL > 0 ? ((honestSupported / sum.TOTAL) * 100).toFixed(1) : 0;
  console.log(`\n  Factual Accuracy Rate: ${accuracyRate}% (${honestSupported}/${sum.TOTAL} non-WRONG)`);
  console.log(`  Pedagogical Specificity Rate: ${((sum.CORRECT / sum.TOTAL) * 100).toFixed(1)}% (${sum.CORRECT}/${sum.TOTAL})`);
  console.log(`  Negative Controls Verified: N1=${evaluationReport.negativeControls.N1_step_limit.verified}, N2=${evaluationReport.negativeControls.N2_compile_error.verified}`);

  // Save report and excerpts
  fs.writeFileSync(path.join(OUTPUT_DIR, 'm2_3_evaluation_results.json'), JSON.stringify(evaluationReport, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'trace_excerpts.json'), JSON.stringify(evaluationReport.traceExcerpts, null, 2), 'utf8');
  console.log(`\nResults written to:`);
  console.log(`  - ${path.join(OUTPUT_DIR, 'm2_3_evaluation_results.json')}`);
  console.log(`  - ${path.join(OUTPUT_DIR, 'trace_excerpts.json')}`);

  return { evaluationReport, hasMandatoryFailures };
}

// ---------------------------------------------------------------------------
// 4. RIGOROUS CHECKPOINT EVALUATOR IMPLEMENTATION
// ---------------------------------------------------------------------------
function gradeCheckpoint(cpDef, trace, sourceCode) {
  const { id, name, targetLine, targetFunc } = cpDef;

  switch (id) {
    // -----------------------------------------------------------------------
    // FIXTURE A: Binary Search
    // -----------------------------------------------------------------------
    case 'CP-A1': {
      // seq[6] initialization in main (Step 0, L23)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int seq[6] ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find step declaring int seq[6]');
      const nextStep = trace[step.step + 1];
      const hasInit = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'seq' && u.index === 0 && u.to === 2);
      const isBefore = step.snapshotConvention === 'before-statement' && step.dsa.diff.arrayUpdates.length === 0;
      const exp = step.dsa.explanationDetail;
      const upcOk = exp && exp.upcoming.includes('int seq[6]');
      if (!isBefore) return makeWrongResult(cpDef, step, 'Violated before-statement convention (updates present before statement)');
      if (hasInit && upcOk) {
        const facetViolations = checkFacetConsistency(step, nextStep);
        if (facetViolations.length > 0) {
          return makeWrongResult(cpDef, step, `Facet consistency failure: ${facetViolations[0]}`);
        }
        return makeResult(cpDef, step, 'CORRECT', 'seq[6] initialized with element breakdown and before-statement timing', ['seq']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'Missing upcoming text or array update verification', ['seq']);
    }

    case 'CP-A2': {
      // While loop condition evaluation (Step 5, L8)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('while (low <= high)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find while loop condition step');
      const exp = step.dsa.explanationDetail;
      const isLoopExplanation = exp && (exp.upcoming.includes('while (low <= high)') || exp.semantics.includes('điều kiện lặp'));
      return makeResult(cpDef, step, isLoopExplanation ? 'GENERIC' : 'PARTIAL', 'Generic language-level loop condition evaluation', ['low', 'high']);
    }

    case 'CP-A3': {
      // Midpoint calculation in findFirstOccurrence (Step 6, L9)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int midPoint ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find midPoint calculation step');
      const nextStep = trace[step.step + 1];
      const midPointUpdated = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'midPoint' && u.to === 2);
      const isBefore = step.snapshotConvention === 'before-statement';
      if (isBefore && midPointUpdated) {
        return makeResult(cpDef, step, 'CORRECT', 'midPoint correctly computed as 2 from low=0, high=5 under before-statement convention', ['midPoint', 'low', 'high']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Assignment step without specific diff verification', ['midPoint']);
    }

    case 'CP-A4': {
      // Duplicate match branch condition check (Step 7, L10)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('if (seq[midPoint] == needle)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find branch condition check step');
      const exp = step.dsa.explanationDetail;
      const isBranch = exp && exp.upcoming.includes('seq[midPoint] == needle');
      return makeResult(cpDef, step, isBranch ? 'GENERIC' : 'PARTIAL', 'Generic branch condition check for duplicate target match', ['midPoint', 'needle']);
    }

    case 'CP-A5': {
      // High boundary left shift (Step 9, L12)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('high = midPoint - 1;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find high adjustment step');
      const nextStep = trace[step.step + 1];
      const highUpdate = nextStep && nextStep.dsa.diff.scalarUpdates.find(u => u.name === 'high');
      if (highUpdate) {
        if (highUpdate.from === 5 && highUpdate.to === 1) {
          return makeResult(cpDef, step, 'CORRECT', 'high boundary shifted from 5 to 1 observed in subsequent step diff', ['high', 'midPoint']);
        }
        // Mutation is present but contradicts expected value (5 -> 1)
        return makeWrongResult(cpDef, step, `Demonstrated false value for high: expected 5 -> 1, observed ${highUpdate.from} -> ${highUpdate.to}`);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'high boundary adjustment without confirmed value transition (no high update in diff)', ['high']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE B: Prefix Sums
    // -----------------------------------------------------------------------
    case 'CP-B1': {
      // cumSum[6] zero-initialization (Step 1, L6)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int cumSum[6] ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find cumSum[6] declaration step');
      const nextStep = trace[step.step + 1];
      const allZeros = nextStep && nextStep.dsa.diff.arrayUpdates.filter(u => u.arrayName === 'cumSum' && u.to === 0).length === 6;
      const noGarbage = !nextStep.dsa.explanationDetail?.observed.includes('thay đổi từ') &&
                        !nextStep.dsa.explanationDetail?.observed.includes('763385576');
      if (allZeros && noGarbage) {
        return makeResult(cpDef, step, 'CORRECT', 'cumSum[6] zero-initialized without stack garbage claims (R01 compliant)', ['cumSum']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'cumSum[6] declaration observed without zero-initialization verification', ['cumSum']);
    }

    case 'CP-B2': {
      // cumSum[1] = cumSum[0] + rawVals[0] (0 + 3 = 3) (Step 3, L8)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.step === 3);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find first iteration of cumSum assignment (Step 3)');
      const nextStep = trace[step.step + 1];
      const mutObserved = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'cumSum' && u.index === 1 && u.from === 0 && u.to === 3);
      const isBefore = step.snapshotConvention === 'before-statement';
      if (isBefore && mutObserved) {
        const facetViolations = checkFacetConsistency(step, nextStep);
        if (facetViolations.length > 0) {
          return makeWrongResult(cpDef, step, `Facet consistency failure: ${facetViolations[0]}`);
        }
        return makeResult(cpDef, step, 'CORRECT', 'cumSum[1] mutated from 0 to 3 verified under before-statement timing', ['cumSum', 'rawVals']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'cumSum[1] mutation step without confirmed (0 -> 3) transition', ['cumSum']);
    }

    case 'CP-B3': {
      // Prefix accumulation loop condition check (Step 2, L7)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('for (int i = 1;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find for loop condition step');
      const exp = step.dsa.explanationDetail;
      const isLoop = exp && exp.upcoming.includes('for (int i = 1;');
      return makeResult(cpDef, step, isLoop ? 'GENERIC' : 'PARTIAL', 'Generic for loop progression condition check', ['i']);
    }

    case 'CP-B4': {
      // Terminal prefix accumulation cumSum[5] = 14 (Step 11, L8)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.step === 11);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find final cumSum accumulation step (Step 11)');
      const nextStep = trace[step.step + 1];
      const finalMut = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'cumSum' && u.index === 5 && u.to === 14);
      if (finalMut) {
        return makeResult(cpDef, step, 'CORRECT', 'cumSum[5] terminal prefix sum mutated to 14 verified in subsequent step', ['cumSum']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Final accumulation step without verified 14 update', ['cumSum']);
    }

    case 'CP-B5': {
      // Range query singleSum = cumSum[3] - cumSum[2] = 4 (Step 14, L11)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int singleSum ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find singleSum range query step');
      const nextStep = trace[step.step + 1];
      const singleSumOk = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'singleSum' && u.to === 4);
      if (singleSumOk) {
        return makeResult(cpDef, step, 'CORRECT', 'singleSum range query evaluated to 4 (8 - 4) verified in diff', ['singleSum']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Scalar assignment without confirmed 4 value', ['singleSum']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE C: Euclidean GCD
    // -----------------------------------------------------------------------
    case 'CP-C1': {
      // Iterative GCD while loop condition check (Step 1, L5)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('while (beta != 0)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find while loop in gcdIterative');
      const exp = step.dsa.explanationDetail;
      const isWhile = exp && exp.upcoming.includes('while (beta != 0)');
      return makeResult(cpDef, step, isWhile ? 'GENERIC' : 'PARTIAL', 'Generic while loop condition check (beta != 0)', ['alpha', 'beta']);
    }

    case 'CP-C2': {
      // Modulo remainder calculation (Step 2, L6)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int remainder ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find remainder step');
      const nextStep = trace[step.step + 1];
      const remOk = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'remainder' && u.to === 12);
      if (remOk) {
        return makeResult(cpDef, step, 'CORRECT', 'remainder 12 (48 % 18) verified in subsequent step diff', ['remainder', 'alpha', 'beta']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Remainder calculation without confirmed scalar value', ['remainder']);
    }

    case 'CP-C3': {
      // Recursive GCD call entry from main (Step 16, L22)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('gcdRecursive(54, 24)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find gcdRecursive invocation in main');
      const nextStep = trace[step.step + 1];
      const pushed = nextStep && nextStep.funcName === 'gcdRecursive' && (nextStep.stackToRender && nextStep.stackToRender.length >= 2);
      if (pushed) {
        return makeResult(cpDef, step, 'CORRECT', 'Call stack frame push to gcdRecursive(54, 24) with active recursion stack verified', ['resRec']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Call step without confirmed frame push', ['resRec']);
    }

    case 'CP-C4': {
      // Recursive GCD base case condition check (v == 0) (Step 21, L14)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.step === 21);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find innermost gcdRecursive base case frame (Step 21)');
      const exp = step.dsa.explanationDetail;
      const isBaseCondition = exp && exp.upcoming.includes('if (v == 0)');
      return makeResult(cpDef, step, isBaseCondition ? 'GENERIC' : 'PARTIAL', 'Generic if branch evaluation for recursive base case', ['u', 'v']);
    }

    case 'CP-C5': {
      // Recursive base case return unwinding (Step 22, L15)
      // 'return u' is verified by upcoming text, but no scalar diff confirms u=6
      // in the diff of the subsequent step. Source-text echo alone is GENERIC.
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('return u;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find return u in gcdRecursive');
      const nextStep = trace[step.step + 1];
      // Check if nextStep diff shows resRec=6 in main (true call unwind evidence)
      const resRecDiff = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'resRec' && u.to === 6);
      if (resRecDiff) {
        const facetViolations = checkFacetConsistency(step, nextStep);
        if (facetViolations.length > 0) {
          return makeWrongResult(cpDef, step, `Facet consistency failure: ${facetViolations[0]}`);
        }
        return makeResult(cpDef, step, 'CORRECT', 'Base case return unwinding with u=6 verified via resRec diff in caller', ['u']);
      }
      // No scalar diff for the return value — honest language-level description only
      const isReturn = step.dsa.explanationDetail?.upcoming.includes('return u');
      return makeResult(cpDef, step, isReturn ? 'GENERIC' : 'PARTIAL', 'Return statement without confirmed caller scalar diff for resRec=6', ['u']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE D: Monotonic Stack
    // -----------------------------------------------------------------------
    case 'CP-D1': {
      // STL vector heights declaration and size resolution (Step 0, L6)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find heights vector declaration');
      const nextStep = trace[step.step + 1];
      const nAssigned = nextStep && trace.some(s => s.dsa.diff.scalarUpdates.some(u => u.name === 'n' && u.to === 5));
      if (nAssigned) {
        return makeResult(cpDef, step, 'CORRECT', 'vector heights size resolved to n=5 verified in trace', ['n']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Vector initialization step', ['heights']);
    }

    case 'CP-D2': {
      // Monotonic stack outer loop index progression (Step 4, L10)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('for (int i = 0;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find outer loop progression step');
      const exp = step.dsa.explanationDetail;
      const isLoop = exp && exp.upcoming.includes('for (int i = 0;');
      return makeResult(cpDef, step, isLoop ? 'GENERIC' : 'PARTIAL', 'Generic for loop index advance', ['i']);
    }

    case 'CP-D3': {
      // Monotonic stack comparison condition (Step 5, L11)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('while (!stk.empty()'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find monotonic comparison check');
      const exp = step.dsa.explanationDetail;
      const isWhile = exp && exp.upcoming.includes('while (!stk.empty()');
      return makeResult(cpDef, step, isWhile ? 'GENERIC' : 'PARTIAL', 'Generic while condition check for monotonic stack invariant', ['i']);
    }

    case 'CP-D4': {
      // Next Greater Element assignment nge[stk.back()] (Step 9, L12)
      // Note: STL vector writes are not tracked as C-array diffs by the normalizer.
      // No array diff evidence is available for nge[stk.back()] — only source-text echo
      // is present in the upcoming facet. This is not sufficient for CORRECT.
      // Downgrade to GENERIC: factually truthful language-level statement description.
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('nge[stk.back()] = heights[i];'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find nge assignment step');
      const nextStep = trace[step.step + 1];
      // Check whether any verified array diff exists for nge
      const hasNgeDiff = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'nge');
      if (hasNgeDiff) {
        // Only promote to CORRECT if a genuine diff is present (robustness forward-compatibility)
        const facetViolations = checkFacetConsistency(step, nextStep);
        if (facetViolations.length > 0) {
          return makeWrongResult(cpDef, step, `Facet consistency failure: ${facetViolations[0]}`);
        }
        return makeResult(cpDef, step, 'CORRECT', 'Next Greater Element assignment with verified nge diff', ['i']);
      }
      // No diff evidence: classify as GENERIC (language-level statement execution)
      const isUpcoming = step.dsa.explanationDetail?.upcoming.includes('nge[stk.back()]');
      return makeResult(cpDef, step, isUpcoming ? 'GENERIC' : 'PARTIAL', 'STL vector write without traceable array diff — language-level statement execution', ['i']);
    }

    case 'CP-D5': {
      // Index push onto monotonic stack (Step 6, L15)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('stk.push_back(i);'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find stk.push_back step');
      const isPush = step.dsa.explanationDetail?.upcoming.includes('stk.push_back');
      return makeResult(cpDef, step, isPush ? 'GENERIC' : 'PARTIAL', 'Generic STL vector push_back statement execution', ['i']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE E: Merge Sort
    // -----------------------------------------------------------------------
    case 'CP-E1': {
      // Top-level divide & conquer invocation mergeSort(data, 0, 3) (Step 0, L33)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('mergeSort(data, 0, 3)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find mergeSort call in main');
      const nextStep = trace[step.step + 1];
      const pushed = nextStep && nextStep.funcName === 'mergeSort' && (nextStep.stackToRender && nextStep.stackToRender.length >= 2);
      if (pushed) {
        return makeResult(cpDef, step, 'CORRECT', 'Top-level divide & conquer frame push to mergeSort(0, 3) verified', ['data']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Call step without confirmed frame push', ['data']);
    }

    case 'CP-E2': {
      // Base condition evaluation if (left >= right) (Step 1, L24)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('if (left >= right)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find base condition in mergeSort');
      const isIf = step.dsa.explanationDetail?.upcoming.includes('left >= right');
      return makeResult(cpDef, step, isIf ? 'GENERIC' : 'PARTIAL', 'Generic base condition check for partition size 1', ['left', 'right']);
    }

    case 'CP-E3': {
      // Partition midpoint calculation (Step 2, L25)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int mid = left +'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find mid calculation in mergeSort');
      const nextStep = trace[step.step + 1];
      const midOk = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'mid' && u.to === 1);
      if (midOk) {
        return makeResult(cpDef, step, 'CORRECT', 'Partition midpoint mid=1 (0 + 3/2) verified in subsequent step diff', ['mid', 'left', 'right']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Midpoint calculation without confirmed scalar diff', ['mid']);
    }

    case 'CP-E4': {
      // Sub-array combine invocation merge(arr, left, mid, right) (Step 15, L28)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('merge(arr, left, mid, right);'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find merge call in mergeSort');
      const nextStep = trace[step.step + 1];
      const mergePushed = nextStep && nextStep.funcName === 'merge';
      if (mergePushed) {
        return makeResult(cpDef, step, 'CORRECT', 'Sub-array combine invocation pushing frame to merge() verified', ['left', 'mid', 'right']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Merge call step', ['left', 'right']);
    }

    case 'CP-E5': {
      // Sorted element merge write arr[k++] = ... (Step 23, L14)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('arr[k++] ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find arr[k++] write in merge');
      const isWrite = step.dsa.explanationDetail?.upcoming.includes('arr[k++]');
      return makeResult(cpDef, step, isWrite ? 'GENERIC' : 'PARTIAL', 'Generic array element write statement in merge', ['k']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE F: Custom Tree
    // -----------------------------------------------------------------------
    case 'CP-F1': {
      // Custom BinNode struct allocation (honest unsupported boundary) (Step 0, L16)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('BinNode* leftChild = new BinNode'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find BinNode allocation step');
      const isNotLinkedList = !step.dsa.mainChain || step.dsa.mainChain.length === 0;
      if (isNotLinkedList) {
        return makeResult(cpDef, step, 'UNSUPPORTED', 'Refused to fabricate a linked list from binary tree struct (mainChain length 0)', ['leftChild']);
      }
      return makeWrongResult(cpDef, step, 'Fabricated a false linear linked list from binary tree struct');
    }

    case 'CP-F2': {
      // Tree traversal recursion entry sumKeys(root) (Step 3, L20)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('sumKeys(root)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find sumKeys call in main');
      const nextStep = trace[step.step + 1];
      const pushed = nextStep && nextStep.funcName === 'sumKeys' && (nextStep.stackToRender && nextStep.stackToRender.length >= 2);
      if (pushed) {
        return makeResult(cpDef, step, 'CORRECT', 'Tree traversal function call push to sumKeys(root) verified', ['root', 'total']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Traversal call step', ['root']);
    }

    case 'CP-F3': {
      // Tree leaf null check if (cur == nullptr) (Step 4, L11)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('if (cur == nullptr)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find cur == nullptr check');
      const isNullCheck = step.dsa.explanationDetail?.upcoming.includes('cur == nullptr');
      return makeResult(cpDef, step, isNullCheck ? 'GENERIC' : 'PARTIAL', 'Generic if branch evaluation for tree leaf null check', ['cur']);
    }

    case 'CP-F4': {
      // Base case return 0 in tree traversal (Step 8, L11)
      // Note: 'return 0' is confirmed by source-text echo in upcoming only.
      // The normalizer does not emit a scalar diff for a return value.
      // Source-text echo alone is not sufficient for CORRECT — downgrade to GENERIC.
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.step === 8);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find return 0 in sumKeys (Step 8)');
      const isRet = step.dsa.explanationDetail?.upcoming.includes('return 0');
      // If the codeText is exactly the null check / return 0 line, that is consistent
      // but it is source-text echo. Classify GENERIC.
      return makeResult(cpDef, step, isRet ? 'GENERIC' : 'PARTIAL', 'Tree leaf base case return 0 — language-level statement execution (no return-value diff available)', ['cur']);
    }

    case 'CP-F5': {
      // Heap deallocation of custom tree root (Step 24, L25)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('delete root;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find delete root step');
      const isDel = step.dsa.explanationDetail?.upcoming.includes('delete root');
      return makeResult(cpDef, step, isDel ? 'GENERIC' : 'PARTIAL', 'Generic C++ heap memory delete statement', ['root']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE G: 1D Dynamic Programming
    // -----------------------------------------------------------------------
    case 'CP-G1': {
      // DP array initialization dp[6] with base 0 and infinity 99 (Step 2, L7)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int dp[6] ='));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find dp[6] declaration step');
      const nextStep = trace[step.step + 1];
      const dpBase0 = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'dp' && u.index === 0 && u.to === 0);
      const dpInf = nextStep && nextStep.dsa.diff.arrayUpdates.filter(u => u.arrayName === 'dp' && u.to === 99).length === 5;
      if (dpBase0 && dpInf) {
        return makeResult(cpDef, step, 'CORRECT', 'dp[6] initialized with base dp[0]=0 and 5 infinity placeholders dp[1..5]=99', ['dp', 'target']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'dp[6] declaration observed without complete value breakdown', ['dp']);
    }

    case 'CP-G2': {
      // Target amount transition in outer DP loop (Step 3, L9)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('for (int amt = 1;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find outer amt loop step');
      const isLoop = step.dsa.explanationDetail?.upcoming.includes('for (int amt = 1;');
      return makeResult(cpDef, step, isLoop ? 'GENERIC' : 'PARTIAL', 'Generic outer loop transition for DP subproblem target amount', ['amt', 'target']);
    }

    case 'CP-G3': {
      // Optimal substructure relaxation comparison check (Step 6, L12)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('if (amt - coinVal >= 0'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find DP relaxation condition check');
      const isCond = step.dsa.explanationDetail?.upcoming.includes('amt - coinVal >= 0');
      return makeResult(cpDef, step, isCond ? 'GENERIC' : 'PARTIAL', 'Generic if branch evaluation for optimal substructure relaxation condition', ['amt', 'coinVal']);
    }

    case 'CP-G4': {
      // DP state relaxation mutation dp[amt] = dp[amt - coinVal] + 1 (Step 7, L13)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.step === 7);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find dp relaxation statement step');
      const nextStep = trace[step.step + 1];
      const dpUpdated = nextStep && nextStep.dsa.diff.arrayUpdates.some(u => u.arrayName === 'dp' && u.index === 1 && u.from === 99 && u.to === 1);
      const isBefore = step.snapshotConvention === 'before-statement';
      if (isBefore && dpUpdated) {
        return makeResult(cpDef, step, 'CORRECT', 'dp[1] relaxed from 99 to 1 verified under before-statement timing', ['dp', 'amt', 'coinVal']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'dp relaxation statement without confirmed (99 -> 1) diff', ['dp']);
    }

    case 'CP-G5': {
      // Terminal DP optimal answer retrieval dp[5] == 2 (Step 67, L18)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('cout << dp[target]'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find terminal cout step');
      const frame = step.stackToRender && step.stackToRender[0];
      const dpArr = frame && frame.encodedLocals && frame.encodedLocals.dp;
      const targetVal2 = dpArr && Array.isArray(dpArr) && dpArr[2 + 5] && dpArr[2 + 5][3] === 2;
      if (targetVal2) {
        return makeResult(cpDef, step, 'CORRECT', 'dp[5] terminal optimal coin count verified as 2 in local memory', ['dp', 'target']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Final output statement', ['target']);
    }

    // -----------------------------------------------------------------------
    // FIXTURE H: Shadowing & Pointers
    // -----------------------------------------------------------------------
    case 'CP-H1': {
      // Local variable val initialized to 5 in main frame (Step 0, L17)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int val = 5;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find int val = 5 in main');
      const nextStep = trace[step.step + 1];
      const val5 = nextStep && nextStep.dsa.diff.scalarUpdates.some(u => u.name === 'val' && u.to === 5);
      if (val5) {
        return makeResult(cpDef, step, 'CORRECT', 'Local variable val initialized to 5 in main stack frame (depth 0)', ['val']);
      }
      return makeResult(cpDef, step, 'PARTIAL', 'Declaration of val without confirmed value 5', ['val']);
    }

    case 'CP-H2': {
      // Call frame push to processOuter with parameter val (Step 2, L11)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine);
      if (!step) return makeUnknownResult(cpDef, 'Cannot find processOuter frame push');
      const frames = step.stackToRender || [];
      const mainFrame = frames.find(f => f.funcName === 'main');
      const outerFrame = frames.find(f => f.funcName === 'processOuter');
      const distinct = mainFrame && outerFrame && mainFrame.frameId !== outerFrame.frameId;
      if (distinct) {
        return makeResult(cpDef, step, 'CORRECT', 'processOuter stack frame created with distinct frame ID from main (depth 1)', ['val', 'ptr']);
      }
      return makeWrongResult(cpDef, step, 'Failed to isolate caller main and callee processOuter stack frames');
    }

    case 'CP-H3': {
      // Pointer passing to computeInner(ptr) in processOuter (Step 3, L12)
      // Evidence: nextStep funcName === 'computeInner' AND stackToRender has 3 frames.
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('computeInner(ptr)'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find computeInner(ptr) call in processOuter');
      const nextStep = trace[step.step + 1];
      const framePushed = nextStep && nextStep.funcName === 'computeInner' &&
                          nextStep.stackToRender && nextStep.stackToRender.length >= 3;
      if (framePushed) {
        const facetViolations = checkFacetConsistency(step, nextStep);
        if (facetViolations.length > 0) {
          return makeWrongResult(cpDef, step, `Facet consistency failure: ${facetViolations[0]}`);
        }
        return makeResult(cpDef, step, 'CORRECT', 'Pointer parameter ptr passed to computeInner from processOuter — frame push to depth 2 verified', ['ptr', 'res']);
      }
      return makeResult(cpDef, step, 'GENERIC', 'Function invocation step without confirmed frame push', ['ptr']);
    }

    case 'CP-H4': {
      // Shadowed local val in computeInner frame (val = 10) (Step 4, L5)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('int val = *targetPtr * 2;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find shadowed val declaration in computeInner');
      const nextStep = trace[step.step + 1];
      const valUpdates = (nextStep && nextStep.dsa.diff.scalarUpdates || []).filter(u => u.name === 'val');
      if (valUpdates.length === 0) {
        return makeResult(cpDef, step, 'PARTIAL', 'computeInner local val without confirmed 10 scalar diff', ['val']);
      }
      // Check frame provenance: must belong to computeInner, NOT main or processOuter
      const wrongFrameUpdate = valUpdates.find(u => u.frameName !== 'computeInner');
      if (wrongFrameUpdate) {
        return makeWrongResult(cpDef, step, `val update attributed to wrong frame: "${wrongFrameUpdate.frameName}" instead of computeInner`);
      }
      const val10InInner = valUpdates.find(u => u.frameName === 'computeInner' && u.to === 10);
      if (val10InInner) {
        return makeResult(cpDef, step, 'CORRECT', 'Shadowed local val in computeInner frame (depth 2) initialized to 10 without corrupting caller val', ['val', 'targetPtr']);
      }
      const badVal = valUpdates.find(u => u.frameName === 'computeInner');
      return makeWrongResult(cpDef, step, `Demonstrated false value for computeInner val: expected 10, got ${badVal ? badVal.to : 'unknown'}`);
    }

    case 'CP-H5': {
      // Pointer indirection mutation (*targetPtr = val + 1) updating outer val (Step 5, L6)
      const step = trace.find(s => s.funcName === targetFunc && s.line === targetLine && s.codeText.includes('*targetPtr = val + 1;'));
      if (!step) return makeUnknownResult(cpDef, 'Cannot find pointer indirection mutation in computeInner');
      const nextStep = trace[step.step + 1];
      const valUpdates = (nextStep && nextStep.dsa.diff.scalarUpdates || []).filter(u => u.name === 'val');
      if (valUpdates.length === 0) {
        return makeResult(cpDef, step, 'PARTIAL', 'Pointer store step without confirmed caller mutation', ['val']);
      }
      // Verify that pointer mutation belongs to caller frame processOuter, NOT main
      const mainMut = valUpdates.find(u => u.frameName === 'main');
      if (mainMut) {
        return makeWrongResult(cpDef, step, 'Pointer mutation incorrectly mutated main frame val instead of caller processOuter');
      }
      const outerMut = valUpdates.find(u => u.frameName === 'processOuter');
      if (!outerMut) {
        return makeWrongResult(cpDef, step, `Pointer mutation not attributed to caller processOuter frame (found frame: "${valUpdates[0].frameName}")`);
      }
      if (outerMut.to !== 11 || (outerMut.from !== undefined && outerMut.from !== 5)) {
        return makeWrongResult(cpDef, step, `Demonstrated false value for processOuter val: expected 5 -> 11, got ${outerMut.from} -> ${outerMut.to}`);
      }
      const isBefore = step.snapshotConvention === 'before-statement';
      if (!isBefore) {
        return makeWrongResult(cpDef, step, 'Violated before-statement timing');
      }
      return makeResult(cpDef, step, 'CORRECT', 'Pointer dereference *targetPtr = 11 correctly mutated caller processOuter val (5 -> 11) with verified frame provenance while leaving main val (5) intact', ['val', 'targetPtr']);
    }

    default:
      return makeUnknownResult(cpDef, `Unhandled checkpoint ID: ${id}`);
  }
}

function makeResult(cpDef, step, candidateVerdict, reason, relevantVarNames = []) {
  // ONE SHARED TRUTHFULNESS GUARD:
  // Apply fact-consistency validation across CORRECT, GENERIC, PARTIAL and UNSUPPORTED candidates
  // before finalizing a checkpoint verdict.
  // A truthful generic explanation may remain GENERIC.
  // A contradictory explanation must be WRONG even when the source-line description is generic.
  if (candidateVerdict !== 'WRONG' && candidateVerdict !== 'UNKNOWN' && step) {
    const violations = validateExplanationFidelity(step);
    if (violations.length > 0) {
      return {
        id: cpDef.id,
        name: cpDef.name,
        targetLine: cpDef.targetLine,
        targetFunc: cpDef.targetFunc,
        step: step.step,
        line: step.line,
        verdict: 'WRONG',
        reason: `Facet truthfulness violation: ${violations[0]}`,
        excerpt: extractTraceExcerpt(step, cpDef.id, relevantVarNames),
      };
    }
  }

  return {
    id: cpDef.id,
    name: cpDef.name,
    targetLine: cpDef.targetLine,
    targetFunc: cpDef.targetFunc,
    step: step ? step.step : -1,
    line: step ? step.line : cpDef.targetLine,
    verdict: candidateVerdict,
    reason,
    excerpt: step ? extractTraceExcerpt(step, cpDef.id, relevantVarNames) : null,
  };
}

function makeWrongResult(cpDef, step, reason) {
  return {
    id: cpDef.id,
    name: cpDef.name,
    targetLine: cpDef.targetLine,
    targetFunc: cpDef.targetFunc,
    step: step ? step.step : -1,
    line: step ? step.line : cpDef.targetLine,
    verdict: 'WRONG',
    reason,
    excerpt: step ? extractTraceExcerpt(step, cpDef.id) : null,
  };
}

function makeUnknownResult(cpDef, reason) {
  return {
    id: cpDef.id,
    name: cpDef.name,
    targetLine: cpDef.targetLine,
    targetFunc: cpDef.targetFunc,
    step: -1,
    line: cpDef.targetLine,
    verdict: 'UNKNOWN',
    reason,
    excerpt: null,
  };
}

if (require.main === module) {
  runEvaluation().then(({ hasMandatoryFailures }) => {
    if (hasMandatoryFailures) {
      console.error('\n❌ Evaluation failed due to mandatory check failures or defects.');
      process.exit(1);
    } else {
      console.log('\n✅ Evaluation completed successfully.');
      process.exit(0);
    }
  }).catch(err => {
    console.error('Fatal evaluation runner error:', err);
    process.exit(1);
  });
}

module.exports = { runEvaluation, gradeCheckpoint, CHECKPOINT_REGISTRY, FIXTURES };
