# DSA FlowLab M2.3 — Generalization & Educational Accuracy Evaluation Protocol

**Document Version:** 1.0.0 (Frozen)  
**Date:** 2026-11-18  
**Baseline Git SHA:** `3bd3179be9ce6118b043653ac2eb318430db2533` (`origin/main`)  
**Evaluator Role:** Independent C++ Debugger Runtime & Educational Semantics Evaluator  

---

## 1. Research Question & Evaluation Scope

How reliably does DSA FlowLab explain and visualize previously unsupported C++ programs, without relying on lesson-specific variable names, hardcoded algorithm identifiers, or fabricated execution semantics?

### Four Evaluation Dimensions:

1. **Execution Correctness:**
   Does the submitted C++17 code compile and run via FlowLab's runner (`cppRunner.ts`), and match the reference compiler (`g++ -std=c++17 -O0`) stdout?
2. **Trace Correctness:**
   Does the recorded line, stack frame depth, local variables, parameters, and memory state correspond strictly to native GDB execution evidence?
3. **Educational Correctness:**
   Are the generated pedagogical facets (*Sắp thực hiện*, *Đã thay đổi*, *Vì sao quan trọng?*) factually supported by observed state transitions under before-statement semantics?
4. **Educational Usefulness:**
   Does the explanation surface meaningful algorithmic insight (invariants, loop bounds, base cases, mutations) rather than merely restating the C++ source line?

---

## 2. Frozen Challenge Fixtures Dataset

The evaluation suite consists of **8 independent, valid C++17 challenge programs** representing distinct algorithmic families, plus **2 negative / control cases**. All programs are stored in `tests/fixtures/m2_3/`.

### Fixture Registry & SHA-256 Checksums

| Fixture ID | File Name | Family / Paradigm | SHA-256 Checksum | Expected Stdout | Known Observation Boundaries |
|---|---|---|---|---|---|
| **A** | `A_binary_search.cpp` | Binary Search (duplicates + absent target) | `91c037548d15e0da129df8dbbe7b9d1add78a461b52f6b242a8300669f30d290` | `1 -1` | Flat scalar stack variables (`low`, `high`, `midPoint`) and static 1D array `seq[6]`. |
| **B** | `B_prefix_sums.cpp` | Prefix Sums & Range Queries | `4da1cbc9735bb72cae68774ecb013b748bd91f58a1200262fcbe15ff43dd15e6` | `14 4` | Array mutation `cumSum[6]`, index offsets `i - 1`, boundary calculation `cumSum[5] - cumSum[0]`. |
| **C** | `C_euclidean_gcd.cpp` | Euclidean GCD (Iterative & Recursive) | `b0c2999168aa9660920c1ee6001c806166632c596088622257c3af2f94737641` | `6 6` | Modulo arithmetic, sequential loop reassignment, and recursive call frames (`gcdRecursive`). |
| **D** | `D_monotonic_stack.cpp` | Monotonic Stack / Next Greater Element | `a479eed55d4e2d62142a57aeaacee390bcbcfd2735f824a87381e379f72ba724` | `5 10 10 -1 -1` | Uses standard STL container `std::vector<int>`. STL internal heap pointers are opaque/unsupported; loop counters (`i`) and scalar output are observed. |
| **E** | `E_merge_sort.cpp` | Merge Sort (Divide & Conquer) | `038d3af6ba41d6271569a26561f2d71d43e2da5a18581d9952d2a4d0ea44b5ce` | `3 27 38 43` | Recursive frame nesting (depth up to 3), local temporary arrays `L[2]`, `R[2]`, array element updates in `arr[]`. |
| **F** | `F_custom_tree.cpp` | Custom Binary Tree Structure | `8b554f02a6dd9e87ee58251234283ee70ac929636f8810bbe70db09fb6949f84` | `30` | Non-standard fields (`key`, `lPtr`, `rPtr`). Must NOT be forced into a linear linked list. Honest custom struct / unsupported topology. |
| **G** | `G_dp_numeric.cpp` | Dynamic Programming on Array | `53089ce77a779ca45c604873351c9a21996a0a0ab4cf730c54a84a8f9afd95ee` | `2` | Repeated mutation of same array indices `dp[amt]`, nested loop variables (`amt`, `i`, `coinVal`). |
| **H** | `H_shadow_pointers.cpp` | Shadowed Variables & Pointer Indirection | `91a4baaf98b2b09d22ecef4142023f23e2b5ddbf5372d067256e3a4cae72de60` | `5 21` | Same identifier `val` in 3 distinct call frames (`main`, `processOuter`, `computeInner`). Pointer write `*targetPtr = val + 1` mutates caller's stack frame. |
| **N1** | `N1_step_limit.cpp` | Negative: Execution / Step Limit | `0cd84bd366c6d858d61ff616ed4ecaaf259c8a7f5a35b859e17ad249a73907f6` | `2000` (truncated) | Exceeds execution step threshold (e.g. 500/1000 steps). Must yield `truncated` status with intact partial trace. |
| **N2** | `N2_compile_error.cpp` | Negative: Compile-Time Error | `7cb9b3f43c7c1c1e613e059b8e67227a8ff50731fd995aded0f161d950d5f888` | (None) | Type mismatch (`int invalidScalar = "string";`). Must return `success: false`, nonempty `buildOutput`, and empty trace. |

*Note: The previously audited LeetCode 124-style `Branch` program is retained strictly as a regression fixture and is excluded from this unseen challenge set.*

---

## 3. Checkpoint Sampling Strategy

To prevent cherry-picking, checkpoints are sampled systematically according to pre-declared semantic trigger events:

1. **Initialization Checkpoints ($CP_{init}$):** The step immediately following variable or array declaration/initialization.
2. **Mutation Checkpoints ($CP_{mut}$):** Steps where an assignment, in-place operator, or pointer store updates an existing variable or array element.
3. **Branch Decision Checkpoints ($CP_{branch}$):** Steps evaluating conditional branches (`if`, `else if`, loop condition) where true vs false branches lead to different outcomes.
4. **Call / Push Checkpoints ($CP_{push}$):** Steps creating a new stack frame depth.
5. **Return / Pop Checkpoints ($CP_{pop}$):** Steps executing a `return` statement and unwinding back to the caller frame.
6. **Boundary / Edge Checkpoints ($CP_{edge}$):** Loop termination, non-existent target, base cases, and terminal return.

For each fixture, exactly **4 to 6 representative checkpoints** covering these categories are sampled, yielding approximately **40–50 checkpoints** across the entire challenge dataset.

---

## 4. Assessment Rubric & Classification Criteria

Every sampled checkpoint is evaluated and classified into exactly one of six distinct categories:

| Rubric Category | Definition | Pass/Fail Consequence |
|---|---|---|
| **`CORRECT`** | The explanation is factually supported by trace evidence, accurately identifies variable names, frames, old/new values, and provides meaningful context under before-statement semantics. | PASS |
| **`PARTIAL`** | The explanation is factually true and supported by the trace, but omits a helpful detail (e.g. mentions variable changed but does not specify the exact delta or index). | PASS (Acceptable) |
| **`GENERIC`** | The explanation merely repeats the source code line or offers neutral boilerplate wording, without offering algorithmic insight. | PASS (Honest limitation; NOT a defect) |
| **`UNSUPPORTED`**| The system truthfully states that it cannot interpret, normalize, or visualize the relevant structure (e.g. non-linear custom struct, STL internal nodes). | PASS (Honest boundary; NOT a defect) |
| **`WRONG`** | The explanation contradicts the trace, invents a causal link, confuses same-named variables across frames, or claims an unexecuted pending action has already occurred. | **FAIL (Defect)** |
| **`UNKNOWN`** | There is insufficient trustworthy evidence in the GDB/tracer snapshot to determine correctness. | **FAIL (Audit gap)** |

### Strict Evaluation Invariants:
- `WRONG` is strictly reserved for falsehoods, frame confusion, fabricated values, or premature claims.
- `GENERIC` is never conflated with `WRONG`. Neutral generic phrasing is honest when specialized heuristics do not apply.
- `UNSUPPORTED` is never counted as an execution failure; truthful negative disclosure is required for educational integrity.

---

## 5. Defect Severity Rules

When an evaluation reveals an error, it is classified according to the following strict scale:

- **P0 (Critical):** Fabricated or dangerously misleading execution state, broken memory safety, server crash, or major execution correctness failure.
- **P1 (High):** Reproducible incorrect educational explanation, confusing frames for shadowed variables, inverted old/new values, or regression in core supported fixtures.
- **P2 (Medium):** Missing educational context where evidence exists, overly generic fallback on common constructs, or minor visual ambiguity.
- **P3 (Low):** Cosmetic wording enhancement or translation polish.

**Closeout Scope:** Only verified P0 and P1 defects are eligible for code fixes in Milestone 2.3. All fixes must be preceded by a failing regression test and use minimal surgical edits.
