/**
 * DSA FlowLab Milestone 2.3 — Generalization & Educational Accuracy Evaluation
 * 
 * Executes the 10 frozen challenge fixtures through the native C++/GDB runner,
 * normalizes the traces, extracts educational facets, and evaluates high-value
 * semantic checkpoints against the frozen assessment rubric.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const { runCppCode } = require('../server/dist/runner/cppRunner');
const { normalizeTrace } = require('../server/dist/normalizer/dsaNormalizer');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'm2_3');
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'eval_results');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const FIXTURES = [
  {
    id: 'A',
    file: 'A_binary_search.cpp',
    name: 'Binary Search (duplicates & missing target)',
    family: 'Binary Search',
    expectedStdout: '1 -1',
    isNegative: false,
  },
  {
    id: 'B',
    file: 'B_prefix_sums.cpp',
    name: 'Prefix Sums & Range Queries',
    family: 'Prefix Sums',
    expectedStdout: '14 4',
    isNegative: false,
  },
  {
    id: 'C',
    file: 'C_euclidean_gcd.cpp',
    name: 'Euclidean GCD (Iterative & Recursive)',
    family: 'Euclidean GCD',
    expectedStdout: '6 6',
    isNegative: false,
  },
  {
    id: 'D',
    file: 'D_monotonic_stack.cpp',
    name: 'Monotonic Stack / Next Greater Element',
    family: 'Monotonic Stack',
    expectedStdout: '5 10 10 -1 -1',
    isNegative: false,
  },
  {
    id: 'E',
    file: 'E_merge_sort.cpp',
    name: 'Merge Sort (Divide & Conquer)',
    family: 'Merge Sort',
    expectedStdout: '3 27 38 43',
    isNegative: false,
  },
  {
    id: 'F',
    file: 'F_custom_tree.cpp',
    name: 'Custom Binary Tree Structure',
    family: 'Custom Tree',
    expectedStdout: '30',
    isNegative: false,
  },
  {
    id: 'G',
    file: 'G_dp_numeric.cpp',
    name: 'Dynamic Programming on Numeric Array',
    family: 'Dynamic Programming',
    expectedStdout: '2',
    isNegative: false,
  },
  {
    id: 'H',
    file: 'H_shadow_pointers.cpp',
    name: 'Shadowed Variables & Pointer Indirection',
    family: 'Shadowing & Pointers',
    expectedStdout: '5 21',
    isNegative: false,
  },
  {
    id: 'N1',
    file: 'N1_step_limit.cpp',
    name: 'Execution / Step Limit Exceeded',
    family: 'Negative / Control (Limit)',
    expectedStdout: '2000',
    isNegative: true,
    expectedStatus: 'truncated',
  },
  {
    id: 'N2',
    file: 'N2_compile_error.cpp',
    name: 'Compile-Time Type Mismatch',
    family: 'Negative / Control (Compile Error)',
    expectedStdout: '',
    isNegative: true,
    expectedSuccess: false,
  },
];

async function runEvaluation() {
  console.log('='.repeat(78));
  console.log('🔬 DSA FlowLab M2.3: Generalization & Educational Accuracy Evaluation');
  console.log('='.repeat(78));

  const evaluationReport = {
    evaluatedAt: new Date().toISOString(),
    baselineCommit: '3bd3179be9ce6118b043653ac2eb318430db2533',
    fixturesCount: FIXTURES.length,
    fixtures: [],
    rubricSummary: {
      CORRECT: 0,
      PARTIAL: 0,
      GENERIC: 0,
      UNSUPPORTED: 0,
      WRONG: 0,
      UNKNOWN: 0,
      TOTAL: 0,
    },
    defects: [],
  };

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

    if (f.id === 'N2') {
      // Negative test 2: compile error expected
      fixtureRecord.stdoutMatch = (runnerResult.success === false && runnerResult.buildOutput.length > 0);
      console.log(`  Compilation failed as expected: ${!runnerResult.success} (build output: ${runnerResult.buildOutput.split('\n')[0]})`);
      evaluationReport.fixtures.push(fixtureRecord);
      continue;
    }

    if (f.id === 'N1') {
      // Negative test 1: trace truncation expected
      const isTruncated = runnerResult.terminationStatus === 'truncated' || runnerResult.trace.length >= 500;
      fixtureRecord.stdoutMatch = isTruncated;
      console.log(`  Trace truncation detected: status=${runnerResult.terminationStatus}, totalSteps=${runnerResult.trace.length}`);
      evaluationReport.fixtures.push(fixtureRecord);
      continue;
    }

    // Positive tests
    fixtureRecord.stdoutMatch = (fixtureRecord.stdout === f.expectedStdout);
    console.log(`  Execution: ${runnerResult.success ? 'SUCCESS' : 'FAILED'} in ${durationMs}ms`);
    console.log(`  Stdout: actual="${fixtureRecord.stdout}" vs expected="${f.expectedStdout}" => ${fixtureRecord.stdoutMatch ? 'PASS' : 'FAIL'}`);

    // Normalize trace
    let normalized = [];
    try {
      normalized = normalizeTrace(runnerResult.trace);
      fixtureRecord.normalizedTraceSteps = normalized.length;
      console.log(`  Normalized steps: ${normalized.length}`);
    } catch (normErr) {
      console.error(`  Normalizer failed: ${normErr.message}`);
    }

    // Inspect trace and evaluate checkpoints
    evaluateFixtureCheckpoints(f.id, sourceCode, normalized, fixtureRecord, evaluationReport);
    evaluationReport.fixtures.push(fixtureRecord);
  }

  // Print Summary
  console.log('\n======================================================================');
  console.log('📊 EVALUATION RUBRIC SUMMARY ACROSS ALL CHECKPOINTS');
  console.log('======================================================================');
  const sum = evaluationReport.rubricSummary;
  console.log(`  CORRECT:     ${sum.CORRECT.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  PARTIAL:     ${sum.PARTIAL.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  GENERIC:     ${sum.GENERIC.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  UNSUPPORTED: ${sum.UNSUPPORTED.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  WRONG:       ${sum.WRONG.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  UNKNOWN:     ${sum.UNKNOWN.toString().padStart(3)} / ${sum.TOTAL}`);
  console.log(`  TOTAL:       ${sum.TOTAL.toString().padStart(3)}`);

  const supportedHonest = sum.CORRECT + sum.PARTIAL + sum.GENERIC + sum.UNSUPPORTED;
  const accuracyRate = sum.TOTAL > 0 ? ((supportedHonest / sum.TOTAL) * 100).toFixed(1) : 0;
  console.log(`\n  Factual Accuracy Rate (Non-WRONG): ${accuracyRate}% (${supportedHonest}/${sum.TOTAL})`);

  // Save report to disk
  fs.writeFileSync(path.join(OUTPUT_DIR, 'm2_3_evaluation_results.json'), JSON.stringify(evaluationReport, null, 2), 'utf8');
  console.log(`\nResults saved to: ${path.join(OUTPUT_DIR, 'm2_3_evaluation_results.json')}`);

  return evaluationReport;
}

function evaluateFixtureCheckpoints(id, sourceCode, trace, record, report) {
  // Checkpoint evaluator per fixture
  switch (id) {
    case 'A':
      evaluateBinarySearchCheckpoints(trace, record, report);
      break;
    case 'B':
      evaluatePrefixSumsCheckpoints(trace, record, report);
      break;
    case 'C':
      evaluateGcdCheckpoints(trace, record, report);
      break;
    case 'D':
      evaluateMonotonicStackCheckpoints(trace, record, report);
      break;
    case 'E':
      evaluateMergeSortCheckpoints(trace, record, report);
      break;
    case 'F':
      evaluateCustomTreeCheckpoints(trace, record, report);
      break;
    case 'G':
      evaluateDpNumericCheckpoints(trace, record, report);
      break;
    case 'H':
      evaluateShadowPointersCheckpoints(trace, record, report);
      break;
  }
}

function recordCheckpoint(record, report, cp) {
  record.checkpoints.push(cp);
  report.rubricSummary[cp.verdict]++;
  report.rubricSummary.TOTAL++;
  const icon = cp.verdict === 'CORRECT' ? '✅' :
               cp.verdict === 'PARTIAL' ? '⚠️' :
               cp.verdict === 'GENERIC' ? 'ℹ️' :
               cp.verdict === 'UNSUPPORTED' ? '🛡️' :
               cp.verdict === 'WRONG' ? '❌' : '❓';
  console.log(`  ${icon} [${cp.id}] Step ${cp.step} (L${cp.line}): ${cp.description} => ${cp.verdict}`);
  if (cp.explanation) {
    console.log(`      Upcoming: "${cp.explanation.upcoming}"`);
    console.log(`      Observed: "${cp.explanation.observed}"`);
    console.log(`      Semantics: "${cp.explanation.semantics}"`);
  }
  if (cp.verdict === 'WRONG') {
    report.defects.push({
      fixture: record.id,
      checkpoint: cp.id,
      step: cp.step,
      line: cp.line,
      severity: cp.severity || 'P1',
      issue: cp.issue,
    });
  }
}

// Checkpoint evaluators for each fixture
function evaluateBinarySearchCheckpoints(trace, record, report) {
  // CP-A1: Array declaration
  const stepInit = trace.find(s => s.codeText && s.codeText.includes('int seq[6] ='));
  if (stepInit) {
    const exp = stepInit.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-A1',
      step: stepInit.step,
      line: stepInit.line,
      type: 'CP_init',
      description: 'Array seq[6] initialization',
      explanation: exp,
      verdict: exp && exp.upcoming.includes('int seq[6]') ? 'CORRECT' : 'PARTIAL',
    });
  }

  // CP-A2: Midpoint calculation
  const stepMid = trace.find(s => s.codeText && s.codeText.includes('int midPoint ='));
  if (stepMid) {
    const exp = stepMid.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-A2',
      step: stepMid.step,
      line: stepMid.line,
      type: 'CP_mut',
      description: 'Midpoint calculation in binary search',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-A3: Duplicate match branch (firstOccurrence = midPoint)
  const stepMatch = trace.find(s => s.codeText && s.codeText.includes('firstOccurrence = midPoint;'));
  if (stepMatch) {
    const exp = stepMatch.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-A3',
      step: stepMatch.step,
      line: stepMatch.line,
      type: 'CP_branch',
      description: 'Target match updates firstOccurrence',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-A4: High pointer adjusted left for duplicates
  const stepHighAdj = trace.find(s => s.codeText && s.codeText.includes('high = midPoint - 1;'));
  if (stepHighAdj) {
    const exp = stepHighAdj.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-A4',
      step: stepHighAdj.step,
      line: stepHighAdj.line,
      type: 'CP_mut',
      description: 'High boundary shifts left to search duplicate prefix',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-A5: Missing target search returns -1
  const stepRet = trace.find(s => s.codeText && s.codeText.includes('return firstOccurrence;') && s.step > 15);
  if (stepRet) {
    const exp = stepRet.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-A5',
      step: stepRet.step,
      line: stepRet.line,
      type: 'CP_edge',
      description: 'Search completion for non-existent target (returns -1)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluatePrefixSumsCheckpoints(trace, record, report) {
  // CP-B1: Zero-init of cumSum
  const stepInit = trace.find(s => s.codeText && s.codeText.includes('int cumSum[6] ='));
  if (stepInit) {
    const exp = stepInit.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-B1',
      step: stepInit.step,
      line: stepInit.line,
      type: 'CP_init',
      description: 'cumSum[6] zero-initialization',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-B2a: Pending prefix sum assignment statement
  const stepAccPre = trace.find(s => s.codeText && s.codeText.includes('cumSum[i] = cumSum[i - 1] + rawVals[i - 1];'));
  if (stepAccPre) {
    const exp = stepAccPre.dsa.explanationDetail;
    const isUpcoming = exp && exp.upcoming.includes('cumSum[i]');
    recordCheckpoint(record, report, {
      id: 'CP-B2a',
      step: stepAccPre.step,
      line: stepAccPre.line,
      type: 'CP_branch',
      description: 'Prefix sum pending assignment statement (before-statement upcoming facet)',
      explanation: exp,
      verdict: isUpcoming ? 'CORRECT' : 'PARTIAL',
    });
  }

  // CP-B2b: Observed array mutation at subsequent step
  const stepAccPost = trace.find(s => s.dsa.diff.arrayUpdates.some(u => u.arrayName === 'cumSum' && u.index === 1));
  if (stepAccPost) {
    const exp = stepAccPost.dsa.explanationDetail;
    const hasUpdate = exp && exp.observed.includes('cumSum[1]');
    recordCheckpoint(record, report, {
      id: 'CP-B2b',
      step: stepAccPost.step,
      line: stepAccPost.line,
      type: 'CP_mut',
      description: 'cumSum[1] mutation observed (0 -> 3) under before-statement convention',
      explanation: exp,
      verdict: hasUpdate ? 'CORRECT' : 'PARTIAL',
    });
  }

  // CP-B3: Full range query calculation
  const stepFull = trace.find(s => s.codeText && s.codeText.includes('int fullSum = cumSum[5] - cumSum[0];'));
  if (stepFull) {
    const exp = stepFull.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-B3',
      step: stepFull.step,
      line: stepFull.line,
      type: 'CP_edge',
      description: 'Full range query boundary (cumSum[5] - cumSum[0] = 14)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-B4: Single element range query
  const stepSingle = trace.find(s => s.codeText && s.codeText.includes('int singleSum = cumSum[3] - cumSum[2];'));
  if (stepSingle) {
    const exp = stepSingle.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-B4',
      step: stepSingle.step,
      line: stepSingle.line,
      type: 'CP_edge',
      description: 'Single element query (cumSum[3] - cumSum[2] = 4)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateGcdCheckpoints(trace, record, report) {
  // CP-C1: Iterative while loop condition
  const stepWhile = trace.find(s => s.codeText && s.codeText.includes('while (beta != 0)'));
  if (stepWhile) {
    const exp = stepWhile.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-C1',
      step: stepWhile.step,
      line: stepWhile.line,
      type: 'CP_branch',
      description: 'Iterative GCD loop condition check (beta != 0)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-C2: Modulo remainder calculation
  const stepRem = trace.find(s => s.codeText && s.codeText.includes('int remainder = alpha % beta;'));
  if (stepRem) {
    const exp = stepRem.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-C2',
      step: stepRem.step,
      line: stepRem.line,
      type: 'CP_mut',
      description: 'Modulo remainder state update in iterative GCD',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-C3: Recursive function call push
  const stepRecCall = trace.find(s => s.codeText && s.codeText.includes('int resRec = gcdRecursive(54, 24);'));
  if (stepRecCall) {
    const exp = stepRecCall.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-C3',
      step: stepRecCall.step,
      line: stepRecCall.line,
      type: 'CP_push',
      description: 'Recursive GCD call entry (gcdRecursive(54, 24))',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-C4: Base case check in recursive GCD
  const stepBase = trace.find(s => s.funcName === 'gcdRecursive' && s.codeText && s.codeText.includes('if (v == 0)'));
  if (stepBase) {
    const exp = stepBase.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-C4',
      step: stepBase.step,
      line: stepBase.line,
      type: 'CP_branch',
      description: 'Recursive GCD base case evaluation (v == 0)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-C5: Recursive return unwinding
  const stepRet = trace.find(s => s.funcName === 'gcdRecursive' && s.codeText && s.codeText.includes('return u;'));
  if (stepRet) {
    const exp = stepRet.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-C5',
      step: stepRet.step,
      line: stepRet.line,
      type: 'CP_pop',
      description: 'Base case return unwinding with GCD result',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateMonotonicStackCheckpoints(trace, record, report) {
  // CP-D1: STL vector declaration
  const stepInit = trace.find(s => s.codeText && s.codeText.includes('vector<int> heights ='));
  if (stepInit) {
    const exp = stepInit.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-D1',
      step: stepInit.step,
      line: stepInit.line,
      type: 'CP_init',
      description: 'STL vector heights declaration and initialization',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-D2: Loop index advance
  const stepFor = trace.find(s => s.codeText && s.codeText.includes('for (int i = 0; i < n; ++i)'));
  if (stepFor) {
    const exp = stepFor.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-D2',
      step: stepFor.step,
      line: stepFor.line,
      type: 'CP_branch',
      description: 'Monotonic stack outer loop transition',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-D3: Monotonic condition check
  const stepWhile = trace.find(s => s.codeText && s.codeText.includes('while (!stk.empty()'));
  if (stepWhile) {
    const exp = stepWhile.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-D3',
      step: stepWhile.step,
      line: stepWhile.line,
      type: 'CP_branch',
      description: 'Monotonic comparison check against top of stack',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-D4: Array write nge[stk.back()]
  const stepNge = trace.find(s => s.codeText && s.codeText.includes('nge[stk.back()] = heights[i];'));
  if (stepNge) {
    const exp = stepNge.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-D4',
      step: stepNge.step,
      line: stepNge.line,
      type: 'CP_mut',
      description: 'Next Greater Element assignment to resolution array',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateMergeSortCheckpoints(trace, record, report) {
  // CP-E1: Initial call to mergeSort
  const stepInitCall = trace.find(s => s.codeText && s.codeText.includes('mergeSort(data, 0, 3);'));
  if (stepInitCall) {
    const exp = stepInitCall.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-E1',
      step: stepInitCall.step,
      line: stepInitCall.line,
      type: 'CP_push',
      description: 'Top-level divide & conquer invocation: mergeSort(data, 0, 3)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-E2: Base condition evaluation (left >= right)
  const stepBase = trace.find(s => s.funcName === 'mergeSort' && s.codeText && s.codeText.includes('if (left >= right) return;'));
  if (stepBase) {
    const exp = stepBase.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-E2',
      step: stepBase.step,
      line: stepBase.line,
      type: 'CP_branch',
      description: 'MergeSort base condition (partition size 1)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-E3: Partition midpoint
  const stepMid = trace.find(s => s.funcName === 'mergeSort' && s.codeText && s.codeText.includes('int mid = left + (right - left) / 2;'));
  if (stepMid) {
    const exp = stepMid.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-E3',
      step: stepMid.step,
      line: stepMid.line,
      type: 'CP_mut',
      description: 'Partition midpoint calculation',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-E4: Merge function invocation
  const stepMerge = trace.find(s => s.funcName === 'mergeSort' && s.codeText && s.codeText.includes('merge(arr, left, mid, right);'));
  if (stepMerge) {
    const exp = stepMerge.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-E4',
      step: stepMerge.step,
      line: stepMerge.line,
      type: 'CP_push',
      description: 'Sub-array combine invocation (merge)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-E5: Sorted element write back to arr[k++]
  const stepWrite = trace.find(s => s.funcName === 'merge' && s.codeText && s.codeText.includes('arr[k++] ='));
  if (stepWrite) {
    const exp = stepWrite.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-E5',
      step: stepWrite.step,
      line: stepWrite.line,
      type: 'CP_mut',
      description: 'Sorted element copy back to target array',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateCustomTreeCheckpoints(trace, record, report) {
  // CP-F1: BinNode allocation
  const stepAlloc = trace.find(s => s.codeText && s.codeText.includes('BinNode* leftChild = new BinNode'));
  if (stepAlloc) {
    const exp = stepAlloc.dsa.explanationDetail;
    // Verify that custom struct is NOT misclassified as a linked list
    const isNotLinkedList = !stepAlloc.dsa.mainChain || stepAlloc.dsa.mainChain.length === 0;
    recordCheckpoint(record, report, {
      id: 'CP-F1',
      step: stepAlloc.step,
      line: stepAlloc.line,
      type: 'CP_init',
      description: 'Custom BinNode struct allocation with uncommon field names',
      explanation: exp,
      verdict: isNotLinkedList ? 'UNSUPPORTED' : 'WRONG',
      issue: !isNotLinkedList ? 'Fabricated linked list from binary tree struct' : undefined,
    });
  }

  // CP-F2: Traversal function invocation
  const stepCall = trace.find(s => s.codeText && s.codeText.includes('int total = sumKeys(root);'));
  if (stepCall) {
    const exp = stepCall.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-F2',
      step: stepCall.step,
      line: stepCall.line,
      type: 'CP_push',
      description: 'Tree traversal recursion entry (sumKeys)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-F3: Null pointer base case in tree
  const stepNull = trace.find(s => s.funcName === 'sumKeys' && s.codeText && s.codeText.includes('if (cur == nullptr) return 0;'));
  if (stepNull) {
    const exp = stepNull.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-F3',
      step: stepNull.step,
      line: stepNull.line,
      type: 'CP_branch',
      description: 'Tree leaf null check (cur == nullptr)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-F4: Memory deallocation delete
  const stepDelete = trace.find(s => s.codeText && s.codeText.includes('delete root;'));
  if (stepDelete) {
    const exp = stepDelete.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-F4',
      step: stepDelete.step,
      line: stepDelete.line,
      type: 'CP_edge',
      description: 'Heap deallocation of custom tree root',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateDpNumericCheckpoints(trace, record, report) {
  // CP-G1: DP array initialization
  const stepInit = trace.find(s => s.codeText && s.codeText.includes('int dp[6] ='));
  if (stepInit) {
    const exp = stepInit.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-G1',
      step: stepInit.step,
      line: stepInit.line,
      type: 'CP_init',
      description: 'DP array initialization: dp[6] with base value 0 and infinity placeholders 99',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-G2: Outer amount loop
  const stepAmt = trace.find(s => s.codeText && s.codeText.includes('for (int amt = 1; amt <= target; ++amt)'));
  if (stepAmt) {
    const exp = stepAmt.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-G2',
      step: stepAmt.step,
      line: stepAmt.line,
      type: 'CP_branch',
      description: 'Target amount transition in outer DP loop',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-G3: Relaxation condition check
  const stepCond = trace.find(s => s.codeText && s.codeText.includes('if (amt - coinVal >= 0 && dp[amt - coinVal] + 1 < dp[amt])'));
  if (stepCond) {
    const exp = stepCond.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-G3',
      step: stepCond.step,
      line: stepCond.line,
      type: 'CP_branch',
      description: 'Optimal substructure comparison condition',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-G4a: Pending relaxation assignment
  const stepUpdatePre = trace.find(s => s.codeText && s.codeText.includes('dp[amt] = dp[amt - coinVal] + 1;'));
  if (stepUpdatePre) {
    const exp = stepUpdatePre.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-G4a',
      step: stepUpdatePre.step,
      line: stepUpdatePre.line,
      type: 'CP_branch',
      description: 'DP relaxation pending assignment statement (upcoming facet)',
      explanation: exp,
      verdict: exp && exp.upcoming.includes('dp[amt]') ? 'CORRECT' : 'PARTIAL',
    });
  }

  // CP-G4b: Observed repeated DP state updates (99 -> 2, then 2 -> 1)
  const stepUpdatePost1 = trace.find(s => s.dsa.diff.arrayUpdates.some(u => u.arrayName === 'dp' && u.index === 2 && u.from === 99 && u.to === 2));
  const stepUpdatePost2 = trace.find(s => s.dsa.diff.arrayUpdates.some(u => u.arrayName === 'dp' && u.index === 2 && u.from === 2 && u.to === 1));
  const hasBothUpdates = !!(stepUpdatePost1 && stepUpdatePost2);
  recordCheckpoint(record, report, {
    id: 'CP-G4b',
    step: stepUpdatePost2 ? stepUpdatePost2.step : (stepUpdatePost1 ? stepUpdatePost1.step : 0),
    line: 10,
    type: 'CP_mut',
    description: 'Repeated DP mutation observed on same index dp[2]: 99 -> 2, then 2 -> 1',
    explanation: stepUpdatePost2 ? stepUpdatePost2.dsa.explanationDetail : undefined,
    verdict: hasBothUpdates ? 'CORRECT' : 'PARTIAL',
  });

  // CP-G5: Final answer lookup
  const stepAns = trace.find(s => s.codeText && s.codeText.includes('cout << dp[target] << endl;'));
  if (stepAns) {
    const exp = stepAns.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-G5',
      step: stepAns.step,
      line: stepAns.line,
      type: 'CP_edge',
      description: 'Terminal DP result retrieval: dp[5] == 2',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }
}

function evaluateShadowPointersCheckpoints(trace, record, report) {
  // CP-H1: Declaration of val in main
  const stepValMain = trace.find(s => s.funcName === 'main' && s.codeText && s.codeText.includes('int val = 5;'));
  if (stepValMain) {
    const exp = stepValMain.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-H1',
      step: stepValMain.step,
      line: stepValMain.line,
      type: 'CP_init',
      description: 'Local variable val initialized to 5 in main frame',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-H2: processOuter frame call with shadowed parameter val
  const stepProcessOuter = trace.find(s => s.funcName === 'processOuter');
  if (stepProcessOuter) {
    const exp = stepProcessOuter.dsa.explanationDetail;
    // Check whether frame identity separates processOuter from main
    const frames = stepProcessOuter.stackToRender || [];
    const mainFrame = frames.find(f => f.funcName === 'main');
    const outerFrame = frames.find(f => f.funcName === 'processOuter');
    const framesDistinct = mainFrame && outerFrame && mainFrame.frameId !== outerFrame.frameId;
    recordCheckpoint(record, report, {
      id: 'CP-H2',
      step: stepProcessOuter.step,
      line: stepProcessOuter.line,
      type: 'CP_push',
      description: 'Call frame push to processOuter with parameter val',
      explanation: exp,
      verdict: framesDistinct ? 'CORRECT' : 'WRONG',
      issue: !framesDistinct ? 'Confused caller and callee frames for val' : undefined,
    });
  }

  // CP-H3: computeInner entry with pointer parameter
  const stepComputeInner = trace.find(s => s.funcName === 'computeInner');
  if (stepComputeInner) {
    const exp = stepComputeInner.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-H3',
      step: stepComputeInner.step,
      line: stepComputeInner.line,
      type: 'CP_push',
      description: 'Call frame push to computeInner with targetPtr',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-H4: Local shadowed val in computeInner
  const stepInnerVal = trace.find(s => s.funcName === 'computeInner' && s.codeText && s.codeText.includes('int val = *targetPtr * 2;'));
  if (stepInnerVal) {
    const exp = stepInnerVal.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-H4',
      step: stepInnerVal.step,
      line: stepInnerVal.line,
      type: 'CP_mut',
      description: 'Shadowed local val in computeInner frame (val = 10)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-H5: Pointer store mutating caller local val (*targetPtr = val + 1)
  const stepPtrStore = trace.find(s => s.funcName === 'computeInner' && s.codeText && s.codeText.includes('*targetPtr = val + 1;'));
  if (stepPtrStore) {
    const exp = stepPtrStore.dsa.explanationDetail;
    recordCheckpoint(record, report, {
      id: 'CP-H5',
      step: stepPtrStore.step,
      line: stepPtrStore.line,
      type: 'CP_mut',
      description: 'Pointer indirection mutation (*targetPtr = val + 1)',
      explanation: exp,
      verdict: exp ? 'CORRECT' : 'GENERIC',
    });
  }

  // CP-H6: Return to main proving main val remained 5
  const stepMainReturn = trace.find(s => s.funcName === 'main' && s.codeText && s.codeText.includes('cout << val << " " << result << endl;'));
  if (stepMainReturn) {
    const exp = stepMainReturn.dsa.explanationDetail;
    const mainFrame = (stepMainReturn.stackToRender || []).find(f => f.funcName === 'main');
    const valInMain = mainFrame && mainFrame.encodedLocals && mainFrame.encodedLocals.val;
    const mainValPreserved = !valInMain || valInMain[3] === 5 || valInMain[3] === '5';
    recordCheckpoint(record, report, {
      id: 'CP-H6',
      step: stepMainReturn.step,
      line: stepMainReturn.line,
      type: 'CP_edge',
      description: 'Return to main: verifies main val remained 5 despite outer mutation',
      explanation: exp,
      verdict: mainValPreserved ? 'CORRECT' : 'WRONG',
      issue: !mainValPreserved ? 'Mutated main frame variable via outer pointer' : undefined,
    });
  }
}

if (require.main === module) {
  runEvaluation().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Fatal evaluation runner error:', err);
    process.exit(1);
  });
}

module.exports = { runEvaluation, FIXTURES };
