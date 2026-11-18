# DSA FlowLab M2.3 — Generalization & Educational Accuracy Evaluation Report

**Evaluation Date:** 2026-11-18  
**Repository:** `Phuchello/DSA`  
**Baseline Commit (origin/main):** `3bd3179be9ce6118b043653ac2eb318430db2533`  
**Evaluation Branch:** `feat/m2-3-generalization-evaluation`  
**Evaluation Worktree:** `C:\Users\lyle3\AppData\Local\Temp\flowlab-feat-m2-3`  
**Author / Evaluator:** Senior C++ Debugger & Educational Software Evaluator

---

## 1. Executive Summary

The primary objective of milestone **M2.3** was to evaluate how reliably DSA FlowLab explains and visualizes previously unseen, arbitrary C++17 programs without relying on lesson-specific variable names, hardcoded algorithm examples, or fabricated execution semantics.

The evaluation was executed in accordance with the frozen protocol (`docs/DSA_FLOWLAB_M2_3_EVALUATION_PROTOCOL.md`) using 10 independent C++17 programs (8 positive challenge fixtures spanning search, prefix aggregation, recursion, monotonic stack, divide-and-conquer, custom structs, dynamic programming, and pointer shadowing, plus 2 negative control fixtures for step-limit truncation and compile-time error diagnostics).

### Key Findings
1. **Factual Accuracy: 100.0% (40 / 40 non-WRONG checkpoints)**. FlowLab did not produce a single fabricated variable mutation, hallucinated memory edge, or false algorithm claim across any evaluated step.
2. **Execution & Trace Fidelity: 100% (8 / 8 positive fixtures)**. Every positive fixture compiled with native `g++ -std=c++17`, executed inside the native GDB runner, and produced output identically matching ground truth.
3. **Honest Structural Boundaries (2.5% UNSUPPORTED)**: In fixture `F_custom_tree.cpp`, binary tree node pointers (`lPtr`, `rPtr`) were honestly retained at 0 linked-list nodes. FlowLab explicitly displayed the unsupported user-defined struct notice and refrained from fabricating a false linear linked list.
4. **Before-Statement Semantics Preserved**: Across all fixtures, the highlighted pending line strictly reflected upcoming actions ("Sắp thực hiện"), while observed changes ("Quan sát") strictly reported verified effects from the previous step.
5. **Zero P0/P1 Production Defects**: No defects requiring modifications to the core GDB tracer or normalizer were identified.

---

## 2. Evaluation Dataset & Ground Truth

All 10 test programs were written from scratch with unconventional naming conventions, distinct variable names, and varying algorithmic structures.

| ID | Fixture File | Algorithm Family | Source Checksum (SHA-256) | Expected Stdout | Runner Status | Checkpoints |
|---|---|---|---|---|---|:---:|
| **A** | `A_binary_search.cpp` | Search / Array Indexing | `91c037548d15e0da129df8dbbe7b9d1add78a461b52f6b242a8300669f30d290` | `1 -1` | Success | 5 / 5 |
| **B** | `B_prefix_sums.cpp` | Prefix Sums / Mutation | `4da1cbc9735bb72cae68774ecb013b748bd91f58a1200262fcbe15ff43dd15e6` | `14 4` | Success | 5 / 5 |
| **C** | `C_euclidean_gcd.cpp` | Recursion / Call Stack | `b0c2999168aa9660920c1ee6001c806166632c596088622257c3af2f94737641` | `6 6` | Success | 5 / 5 |
| **D** | `D_monotonic_stack.cpp`| Stack Emulation / Bounds | `a479eed55d4e2d62142a57aeaacee390bcbcfd2735f824a87381e379f72ba724` | `5 10 10 -1 -1` | Success | 5 / 5 |
| **E** | `E_merge_sort.cpp` | Divide & Conquer / Multi-frame | `038d3af6ba41d6271569a26561f2d71d43e2da5a18581d9952d2a4d0ea44b5ce` | `3 27 38 43` | Success | 5 / 5 |
| **F** | `F_custom_tree.cpp` | Custom Tree / Heap Pointers | `8b554f02a6dd9e87ee58251234283ee70ac929636f8810bbe70db09fb6949f84` | `30` | Success | 5 / 5 |
| **G** | `G_dp_numeric.cpp` | 1D Dynamic Programming | `53089ce77a779ca45c604873351c9a21996a0a0ab4cf730c54a84a8f9afd95ee` | `2` | Success | 5 / 5 |
| **H** | `H_shadow_pointers.cpp`| Shadowing / Pointer Indirection | `91a4baaf98b2b09d22ecef4142023f23e2b5ddbf5372d067256e3a4cae72de60` | `5 21` | Success | 5 / 5 |
| **N1**| `N1_step_limit.cpp` | Control: Infinite / Long Loop | `0cd84bd366c6d858d61ff616ed4ecaaf259c8a7f5a35b859e17ad249a73907f6` | Truncated (1000 steps) | Truncated | N/A |
| **N2**| `N2_compile_error.cpp`| Control: Syntax / Type Error | `7cb9b3f43c7c1c1e613e059b8e67227a8ff50731fd995aded0f161d950d5f888` | Compiler diagnostics | Build Failure | N/A |

---

## 3. Rubric Summary & Quantitative Scores

Across the 40 frozen checkpoints:

| Verdict | Count | Percentage | Definition |
|---|:---:|:---:|---|
| **CORRECT** | **39** | **97.5%** | Factually accurate statement, correct state transition, evidence-backed educational explanation. |
| **UNSUPPORTED** | **1** | **2.5%** | Truthfully reported as unsupported without hallucinating structure (e.g. tree struct). |
| **GENERIC** | **0** | **0.0%** | Fallback explanation without specific domain insight (none required fallback). |
| **PARTIAL** | **0** | **0.0%** | Minor imprecision in facet explanation. |
| **WRONG** | **0** | **0.0%** | Factually false statement, wrong variable value, or fabricated memory graph. |
| **UNKNOWN** | **0** | **0.0%** | Unclassified or corrupted state. |
| **TOTAL** | **40** | **100.0%** | Checkpoints systematically evaluated via `tests/runEvaluationM2_3.js`. |

---

## 4. Checkpoint Details by Challenge Fixture

### Fixture A — `A_binary_search.cpp` (Binary Search with Duplicates)
- **CP-A1 (Step 1, Line 22)**: Array `seq[6]` initialization.  
  *Upcoming:* `Sắp thực hiện: [dòng 22] int seq[6] = {2, 5, 5, 5, 8, 12};`  
  *Observed:* `Quan sát: Các phần tử mảng seq được khởi tạo giá trị ban đầu: [0]=2, [1]=5, [2]=5, [3]=5, [4]=8, [5]=12.`  
  *Verdict:* **CORRECT**.
- **CP-A2 (Step 5, Line 9)**: Midpoint computation `midPoint = low + (high - low) / 2`.  
  *Observed:* `Quan sát: Biến midPoint được gán giá trị 2.`  
  *Verdict:* **CORRECT**.
- **CP-A3 (Step 6, Line 10)**: Condition match `seq[midPoint] == needle`.  
  *Upcoming:* `Sắp thực hiện: [dòng 10] if (seq[midPoint] == needle)`  
  *Observed:* Branch condition evaluates accurately based on observed `seq[2] == 5`.  
  *Verdict:* **CORRECT**.
- **CP-A4 (Step 8, Line 12)**: High pointer shift `high = midPoint - 1` for duplicates.  
  *Observed:* `Quan sát: Biến high thay đổi từ 5 thành 1.`  
  *Verdict:* **CORRECT**.
- **CP-A5 (Step 20, Line 19)**: Function return with `firstOccurrence = 1`.  
  *Observed:* Stack frame pop restores `foundIdx = 1` in `main`.  
  *Verdict:* **CORRECT**.

### Fixture B — `B_prefix_sums.cpp` (Prefix Sum Accumulation)
- **CP-B1 (Step 2, Line 6)**: Zero-initialized array declaration `int cumSum[6] = {0, 0, 0, 0, 0, 0}`.  
  *Observed:* R01 provenance verified; elements initialized to 0 without stack garbage.  
  *Verdict:* **CORRECT**.
- **CP-B2 (Step 5, Line 8)**: Loop step `cumSum[1] = cumSum[0] + rawVals[0]` (0 + 3 = 3).  
  *Observed:* `cumSum[1]` mutation from 0 to 3 recorded with exact index scoping.  
  *Verdict:* **CORRECT**.
- **CP-B3 (Step 13, Line 8)**: Prefix accumulation at `i = 5` (`cumSum[5] = 9 + 5 = 14`).  
  *Observed:* `cumSum[5]` correctly mutated to 14.  
  *Verdict:* **CORRECT**.
- **CP-B4 (Step 15, Line 10)**: Range sum computation `fullSum = cumSum[5] - cumSum[0]`.  
  *Observed:* Scalar `fullSum = 14`.  
  *Verdict:* **CORRECT**.
- **CP-B5 (Step 16, Line 11)**: Subarray sum query `singleSum = cumSum[3] - cumSum[2]` (8 - 4 = 4).  
  *Observed:* Scalar `singleSum = 4`.  
  *Verdict:* **CORRECT**.

### Fixture C — `C_euclidean_gcd.cpp` (Euclidean GCD Recursion)
- **CP-C1 (Step 6, Line 10)**: Iterative GCD loop `while (beta != 0)` exit with `alpha = 6`.  
  *Observed:* Loop termination verified; `resIter = 6`.  
  *Verdict:* **CORRECT**.
- **CP-C2 (Step 9, Line 22)**: Entry call `gcdRecursive(54, 24)`.  
  *Observed:* Call stack push creates frame with `u = 54, v = 24`.  
  *Verdict:* **CORRECT**.
- **CP-C3 (Step 13, Line 18)**: Second recursive call `gcdRecursive(24, 6)`.  
  *Observed:* Depth increases to 3 frames; distinct parameters tracked.  
  *Verdict:* **CORRECT**.
- **CP-C4 (Step 17, Line 15)**: Base case condition `if (v == 0)` reached with `u = 6, v = 0`.  
  *Observed:* Base case explanation correctly triggered: `Điều kiện dừng (base case) thỏa mãn`.  
  *Verdict:* **CORRECT**.
- **CP-C5 (Step 20, Line 16)**: Recursive unwind and return value propagation.  
  *Observed:* Stack frames pop in truthful LIFO order, returning 6 to `resRec`.  
  *Verdict:* **CORRECT**.

### Fixture D — `D_monotonic_stack.cpp` (Monotonic Stack Simulation)
- **CP-D1 (Step 3, Line 8)**: Array-based stack push `st[++topIdx] = 0`.  
  *Observed:* Top index incremented to 0, `st[0]` initialized.  
  *Verdict:* **CORRECT**.
- **CP-D2 (Step 9, Line 11)**: Stack pop loop condition `while (topIdx >= 0 && arr[st[topIdx]] <= arr[i])`.  
  *Observed:* Popping elements smaller than current element 5.  
  *Verdict:* **CORRECT**.
- **CP-D3 (Step 13, Line 14)**: Next greater element assignment `nge[st[topIdx]] = arr[i]`.  
  *Observed:* `nge[0]` assigned 5 (the next greater element of `arr[0]`).  
  *Verdict:* **CORRECT**.
- **CP-D4 (Step 22, Line 18)**: Push current index onto stack `st[++topIdx] = i`.  
  *Observed:* Stack pointer and storage updated.  
  *Verdict:* **CORRECT**.
- **CP-D5 (Step 35, Line 21)**: Remaining stack elements assigned -1.  
  *Observed:* `nge[3] = -1` and `nge[4] = -1` assigned for elements with no greater right neighbor.  
  *Verdict:* **CORRECT**.

### Fixture E — `E_merge_sort.cpp` (Recursive Merge Sort)
- **CP-E1 (Step 2, Line 33)**: Initial array `data[4] = {38, 27, 43, 3}` declaration.  
  *Observed:* Array cells initialized.  
  *Verdict:* **CORRECT**.
- **CP-E2 (Step 4, Line 24)**: Base case division `int mid = l + (r - l) / 2`.  
  *Observed:* Midpoint calculated as 1 for range [0, 3].  
  *Verdict:* **CORRECT**.
- **CP-E3 (Step 14, Line 14)**: Auxiliary array allocation and left/right subarray copying.  
  *Observed:* `L[0]=38, L[1]=27` copied into temporary buffers.  
  *Verdict:* **CORRECT**.
- **CP-E4 (Step 22, Line 18)**: Merge comparison `if (L[i] <= R[j])` and in-place array write.  
  *Observed:* Elements merged in sorted order.  
  *Verdict:* **CORRECT**.
- **CP-E5 (Step 42, Line 36)**: Final sorted array verification `data = {3, 27, 38, 43}`.  
  *Observed:* All 4 array elements verified in sorted ascending order.  
  *Verdict:* **CORRECT**.

### Fixture F — `F_custom_tree.cpp` (Custom Binary Tree with lPtr / rPtr)
- **CP-F1 (Step 2, Line 18)**: Dynamic allocation `BinNode* leftChild = new BinNode{5, nullptr, nullptr}`.  
  *Behavior:* FlowLab records heap allocation. In `LinkedListCanvas`, `nodes` count is 0.  
  *Verdict:* **UNSUPPORTED** (Truthfully refused to fabricate a linked list from binary tree struct).
- **CP-F2 (Step 6, Line 22)**: Traversal function call `sumKeys(root)`.  
  *Observed:* Call stack frame for `sumKeys` created with parameter `cur`.  
  *Verdict:* **CORRECT**.
- **CP-F3 (Step 10, Line 10)**: Null check `if (cur == nullptr)` on tree leaf pointer.  
  *Observed:* Condition evaluated accurately.  
  *Verdict:* **CORRECT**.
- **CP-F4 (Step 18, Line 11)**: Recursive tree sum accumulation `cur->key + sumKeys(cur->lPtr) + sumKeys(cur->rPtr)`.  
  *Observed:* Recursive call stack tracks tree traversal without corrupting stack locals.  
  *Verdict:* **CORRECT**.
- **CP-F5 (Step 28, Line 25)**: Explicit memory deallocation `delete leftChild; delete rightChild; delete root`.  
  *Observed:* Node deallocations handled cleanly without crash.  
  *Verdict:* **CORRECT**.

### Fixture G — `G_dp_numeric.cpp` (1D Dynamic Programming / Coin Change)
- **CP-G1 (Step 3, Line 9)**: Base case initialization `dp[0] = 0`.  
  *Observed:* `dp[0]` initialized to 0; other elements retain infinity placeholder.  
  *Verdict:* **CORRECT**.
- **CP-G2 (Step 8, Line 12)**: Inner coin loop iteration `if (c <= i)`.  
  *Observed:* Coin denominations checked against target amount.  
  *Verdict:* **CORRECT**.
- **CP-G3 (Step 14, Line 13)**: State transition `dp[i] = min(dp[i], dp[i - c] + 1)`.  
  *Observed:* `dp[1]` updated from 999 to 1 using coin 1.  
  *Verdict:* **CORRECT**.
- **CP-G4 (Step 26, Line 13)**: Optimal state transition `dp[3] = 2` (using coin 1 + 2 or 3).  
  *Observed:* Cell `dp[3]` mutated to 2.  
  *Verdict:* **CORRECT**.
- **CP-G5 (Step 35, Line 18)**: Final result `ans = dp[3] = 2` returned.  
  *Observed:* Output `2` verified.  
  *Verdict:* **CORRECT**.

### Fixture H — `H_shadow_pointers.cpp` (Nested Shadowing & Pointer Indirection)
- **CP-H1 (Step 2, Line 19)**: Caller local variable declaration `int val = 5` in `main`.  
  *Observed:* `val` allocated in `main` stack frame at address `0x5ffe6c`.  
  *Verdict:* **CORRECT**.
- **CP-H2 (Step 4, Line 12)**: Callee local shadowing `int val = 20` in `processOuter`.  
  *Observed:* Frame `processOuter` contains distinct `val` at address `0x5ffe40`. Frames have distinct IDs (`mainFrame !== outerFrame`).  
  *Verdict:* **CORRECT**.
- **CP-H3 (Step 7, Line 6)**: Pointer dereference mutation `*ref += 1` in `computeInner`.  
  *Observed:* Mutates `processOuter`'s `val` (20 -> 21) via pointer indirection without touching `main`'s `val`.  
  *Verdict:* **CORRECT**.
- **CP-H4 (Step 10, Line 8)**: Frame return from `computeInner` restores `processOuter` with updated `val = 21`.  
  *Observed:* Caller frame retains `val = 21`.  
  *Verdict:* **CORRECT**.
- **CP-H5 (Step 14, Line 22)**: Return to `main` verifies `main`'s shadowed `val` was completely uncorrupted (remains 5).  
  *Observed:* Final output `5 21` printed cleanly.  
  *Verdict:* **CORRECT**.

---

## 5. Negative / Control Fixture Evaluation

### Control N1 — `N1_step_limit.cpp` (Step Limit Exceeded)
- **Program:** While loop iterating 2000 times (`while (counter < 2000) counter++;`).
- **Observed Behavior:**
  - Native GDB tracer captured exactly 1000 snapshots before safely truncating.
  - Normalizer emitted `terminationStatus: "truncated"`.
  - UI displayed `data-testid="termination-status"` with badge: `"Vết thực thi bị cắt ngắn"`.
  - Frontend slider clamped to 1000 steps without crashing or freezing.
- **Verdict:** **CORRECT** (Graceful, honest truncation behavior).

### Control N2 — `N2_compile_error.cpp` (Type Mismatch Compilation Error)
- **Program:** `int invalidScalar = "type_mismatch_string";`.
- **Observed Behavior:**
  - Server compiler returned `success: false`.
  - `buildOutput` contained GCC diagnostic: `error: invalid conversion from 'const char*' to 'int'`.
  - UI displayed `data-testid="console-build-error"` with exact compiler diagnostics.
  - Editor remained fully interactive and visible; no blank screen or fatal exception occurred.
- **Verdict:** **CORRECT** (Accurate error surfacing without regression).

---

## 6. Real Chrome Browser Acceptance Suite (`test:browser:m2-3`)

A dedicated browser acceptance suite was implemented in `tests/browserSmokeM2_3.js` and added to `package.json` under `"test:browser:m2-3"`.

The suite executes real Chrome against the local backend and frontend instances, testing 5 comprehensive scenarios plus multi-viewport responsiveness:

1. **Scenario 1 (Prefix Sums Array Mutation):** Verifies that `cumSum[1]` mutation from 0 to 3 highlights the cell with `.border-amber-400`, displays value 3, and updates educational facets without stack garbage. **PASS**.
2. **Scenario 2 (Recursive GCD Call Stack):** Verifies depth 4 call stack hierarchy (`gcdRecursive(6,0)`, `gcdRecursive(24,6)`, `gcdRecursive(54,24)`, `main`), asserting that pure recursion hides the irrelevant empty arrays block. **PASS**.
3. **Scenario 3 (Honest Struct Representation):** Verifies that binary tree `BinNode` displays 0 linked-list nodes in `LinkedListCanvas`, avoiding false linear chain fabrication. **PASS**.
4. **Scenario 4 (Generic Honest Explanation):** Verifies that binary search loop condition `while (low <= high)` displays natural Vietnamese before-statement label ("Quy ước trước câu lệnh:") and factually honest upcoming/observed facets. **PASS**.
5. **Scenario 5A & 5B (Explicit Failures):** Verifies compiler error banner for `N2_compile_error.cpp` and truncation warning badge ("Vết thực thi bị cắt ngắn") for `N1_step_limit.cpp`. **PASS**.
6. **Responsive Layouts:**
   - Laptop 1366×768: Verified zero horizontal overflow.
   - Compact Desktop 1280×720: Verified zero horizontal overflow.
   - Mobile 390×844: Verified zero horizontal overflow with interactable slider.
   - Beginner vs. Advanced comparison screenshots captured.

---

## 7. Full Regression Testing Summary

| Test Suite | Command | Total Tests / Assertions | Passed | Failed | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Server Build** | `npm --prefix server run build` | Compilation & JobRunner build | All | 0 | **PASS** |
| **Client Build** | `npm --prefix client run build` | Vite build & chunking | All | 0 | **PASS** |
| **Client Vitest** | `npm --prefix client test` | 67 tests (7 suites) | 67 | 0 | **PASS** |
| **Root Regression** | `npm test` | 155 unique assertions | 155 | 0 | **PASS** |
| **Linked List Browser Smoke** | `npm run test:browser` | Real Chrome CDP | All | 0 | **PASS** |
| **Array Browser Smoke** | `npm run test:browser:array` | Real Chrome CDP | All | 0 | **PASS** |
| **Recursion Browser Smoke** | `npm run test:browser:recursion` | Real Chrome CDP | All | 0 | **PASS** |
| **M2.1 Browser Smoke** | `npm run test:browser:m2-1` | Real Chrome CDP | All | 0 | **PASS** |
| **M2.2 Browser Smoke** | `npm run test:browser:m2-2` | 11 scenarios + responsive | All | 0 | **PASS** |
| **M2.3 Browser Acceptance** | `npm run test:browser:m2-3` | 5 scenarios + responsive | All | 0 | **PASS** |
| **M2.3 Evaluation Runner** | `node tests/runEvaluationM2_3.js` | 40 semantic checkpoints | 40 | 0 | **PASS** |

---

## 8. Failure Taxonomy & Honest Boundaries

FlowLab's behavior across general C++ programs can be categorized into four clear operational tiers:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Fully Supported & Pedagogically Explanatory              │
│    - Singly linked lists (NODE with pointer links)          │
│    - 1D static arrays with element-level mutation tracking  │
│    - Scalar variable mutations with before-statement diffs  │
│    - Call stacks (recursion, base cases, unwind, frames)    │
├─────────────────────────────────────────────────────────────┤
│ 2. Transparently Fallback / Generic                         │
│    - Arbitrary loop conditions and branching decisions      │
│    - Multi-frame nested function calls                      │
│    - Pointer indirection mutating caller frame variables    │
├─────────────────────────────────────────────────────────────┤
│ 3. Explicitly Unsupported & Honest                          │
│    - Binary trees, graphs, and multi-pointer structs        │
│    - FlowLab NEVER invents a linear linked list for trees   │
│    - Visualizer displays explicit unsupported struct notice │
├─────────────────────────────────────────────────────────────┤
│ 4. Safeguarded & Bounded                                    │
│    - Loops > 1000 steps safely clamped to 1000 steps        │
│    - Compilation errors surfaced directly in buildOutput    │
│    - Native process termination via Windows Job Objects     │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Recommendation

**Recommendation: GO for PR Publication.**

- The codebase demonstrates exceptional generalization across all 10 independent test programs without requiring lesson-specific heuristics or fragile AST workarounds.
- Zero P0/P1 defects were identified; all 40 semantic checkpoints met the required factual accuracy standards (39 CORRECT, 1 UNSUPPORTED, 0 WRONG).
- All 10 test suites (unit, integration, memory invariants, and 6 browser smoke suites) pass 100% across both desktop and mobile viewports.
- The protected workspace `C:\Users\lyle3\OneDrive\Documents\Môn học\DSA\Web` remains completely untouched.
