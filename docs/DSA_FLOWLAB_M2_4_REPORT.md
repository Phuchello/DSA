# DSA FlowLab M2.4 — Evidence-Grounded Control Flow Clarity Report

**Branch:** `feat/m2-4-control-flow-clarity`  
**Baseline:** `df8b0e9cd06c5316066cfb64ea14b128e24236e8`  
**Status:** Verified local release candidate (**GO** for PR review; not pushed or merged)

---

## 1. Objective & Scope Boundary

Milestone M2.4 improves the pedagogical usefulness of simple C++ control-flow condition statements (`if`, `else if`, `while`, and pure-condition `for (; cond; )`) by deterministically evaluating condition outcomes using **active-frame** native GDB snapshot values from `encodedLocals`.

M2.4 stays strictly conservative:
- Uses **only** the active frame (`isHighlighted` or innermost frame on `stackToRender`).
- Preserves strict **before-statement** semantics (`snapshotConvention = "before-statement"`): explains current operand values, the exact comparison performed, the deterministic boolean outcome, and the *prospective* next-step control-flow implication without claiming any future transition has already completed.
- Preserves the frozen M2.3 40-checkpoint evaluation baseline (`docs/eval_results/m2_3_evaluation_results.json`) as historical evidence.

---

## 2. Classification of the 17 Historical M2.3 `GENERIC` Checkpoints

Out of the 17 `GENERIC` checkpoints recorded in M2.3:

### A. Upgraded by M2.4 (4 simple scalar conditions with trustworthy active-frame values)

| Checkpoint | Statement | Active Snapshot Values | M2.3 Baseline (`GENERIC`) | M2.4 Grounded Output |
| :--- | :--- | :--- | :--- | :--- |
| **CP-A2** | `while (low <= high) {` (`findFirstOccurrence`, Step 5, L8) | `low = 0, high = 5` | `Ngữ nghĩa trước câu lệnh: Biểu thức lặp chuẩn bị được đánh giá. Giá trị các biến phản ánh trạng thái trước bước lặp này.` | `Ngữ nghĩa trước câu lệnh: Với trạng thái hiện tại (low = 0, high = 5), phép kiểm tra 0 <= 5 cho kết quả Đúng (true) — điều kiện lặp đang được đáp ứng nên chương trình chuẩn bị bước vào thân vòng lặp (bước chuyển tiếp thực tế được xác nhận ở bước kế tiếp).` |
| **CP-C1** | `while (beta != 0) {` (`gcdIterative`, Step 1, L5) | `beta = 18` | `Mỗi khung ngăn xếp lưu giữ độc lập các biến cục bộ và tham số của lần gọi hàm này.` (was shadowed by push transition) | `Ngữ nghĩa trước câu lệnh: Với trạng thái hiện tại (beta = 18), phép kiểm tra 18 != 0 cho kết quả Đúng (true) — điều kiện lặp đang được đáp ứng nên chương trình chuẩn bị bước vào thân vòng lặp (bước chuyển tiếp thực tế được xác nhận ở bước kế tiếp).` |
| **CP-C4** | `if (v == 0) {` (`gcdRecursive`, Step 21, L14) | `v = 0` | `Chuẩn bị kiểm tra điều kiện rẽ nhánh (if) để quyết định luồng thực thi tiếp theo. Khi thiếu bằng chứng, không thể suy luận kết quả chỉ từ mã nguồn.` | `Điều kiện rẽ nhánh thỏa mãn (trạng thái hiện tại: v = 0; phép kiểm tra 0 == 0 -> Đúng (true)). Khối lệnh bên trong chuẩn bị được thực thi (chưa kết thúc đệ quy do không chứa lệnh return kết thúc hàm; bước chuyển tiếp thực tế được xác nhận ở bước kế tiếp).` |
| **CP-E2** | `if (left >= right) return;` (`mergeSort`, Step 1, L24) | `left = 0, right = 3` | `Chuẩn bị kiểm tra điều kiện rẽ nhánh (if) để quyết định luồng thực thi tiếp theo. Khi thiếu bằng chứng, không thể suy luận kết quả chỉ từ mã nguồn.` | `Điều kiện rẽ nhánh chưa được đáp ứng (trạng thái hiện tại: left = 0, right = 3; phép kiểm tra 0 >= 3 -> Sai (false)) — chương trình chuẩn bị bỏ qua khối lệnh bên trong nhánh này.` |

*(Note: Running `npm run test:eval` after M2.4 confirms only those 4 checkpoints changed explanation semantics across all 40 checkpoints, while M2.3's frozen rubric totals remain 22 CORRECT / 17 GENERIC / 1 UNSUPPORTED / 0 PARTIAL / 0 WRONG / 0 UNKNOWN with 11/11 corruption checks passing.)*

### B. Honestly Preserved as `GENERIC` (13 checkpoints)

1. **`for (init; cond; incr)` loop headers with uninitialized or pending increment state (3):** `CP-B3` (`for (int i = 1; i <= 5; ++i)`), `CP-D2` (`for (int i = 0; i < n; ++i)`), `CP-G2` (`for (int amt = 1; amt <= target; ++amt)`). Before execution, loop variables carry `'?'` (`uninitialized`), and on loop back-edges `incr` is pending before `cond`. Refusing evaluation avoids pre-init/pre-increment falsehoods.
2. **Compound / array-subscript / STL conditions (3):** `CP-A4` (`if (seq[midPoint] == needle)`), `CP-D3` (`while (!stk.empty() && heights[stk.back()] < heights[i])`), `CP-G3` (`if (amt - coinVal >= 0 && dp[amt - coinVal] + 1 < dp[amt])`).
3. **Pointer null-check / return / heap / STL / array statements outside scalar condition scope (7):** `CP-F3` (`if (cur == nullptr) return 0;`), `CP-C5` (`return u;`), `CP-D4` (`nge[stk.back()] = heights[i];`), `CP-D5` (`stk.push_back(i);`), `CP-E5` (`arr[k++] = L[i++];`), `CP-F4` (`return 0;`), `CP-F5` (`delete root;`).

---

## 3. Supported vs. Unsupported Condition Forms

### Supported (Deterministic & Active-Frame Only)
- Control-flow headers: `if (...)`, `else if (...)` / `} else if (...)`, `while (...)`, and pure-condition `for (; cond; )`.
- Integer equality & inequality: `==`, `!=`
- Integer relational comparisons: `<`, `<=`, `>`, `>=`
- Operand forms for integer comparisons: decimal integer literals (`0`, `-?[1-9]\d*`; octal literals like `010` excluded) and verified active-frame integer variables (`int`, `short`, `long`, `long long`, `unsigned ...`, `size_t`, fixed-width integer typedefs) with finite safe-integer values (never `'?'` / `uninitialized`), requiring at least one variable operand and bailing out on C++ signed/unsigned negative wraparound pairs.
- Simple boolean predicates: `flag`, `!flag`, `flag == true|false`, `flag != true|false` (both operand orders) when the active frame reports type `bool` with boolean value.
- Function-entry `while` condition shadowing fix: evaluated loop condition semantics take precedence over `diff.frameTransition?.type === 'push'` so function-entry `while` loops (e.g. `CP-C1`) explain their loop condition rather than stack creation alone.

### Explicitly Unsupported (Fallback to Honest `GENERIC`)
- Compound logical expressions (`&&`, `||`, ternary `? :`).
- Array subscripts (`a[i]`), member/arrow access (`node->val`, `obj.x`), dereferences (`*p`), function/method calls (`!stk.empty()`, `f(x)`), arithmetic/bitwise subexpressions (`a + b`, `amt - coin`), mutations (`++i`, assignment `=`), or non-integer/float/char/`uninitialized`/`?` operands.
- `for (init; cond; incr)` whenever `init` or `incr` is non-empty.
- Never borrows variable values from caller/inactive stack frames; never executes or `eval`s extracted C++ expressions.

---

## 4. Native C++/GDB Educational Acceptance Highlights (Fresh M2.4 Fixtures)

Two new C++17 fixtures using unfamiliar identifiers (`tests/fixtures/m2_4/01_window_bound_scan.cpp` and `02_bool_flag_countdown.cpp`) were compiled with `g++ -std=c++17 -O0`, executed under real GDB via `runCppCode`, normalized with `normalizeTrace`, and verified in headless Chrome:

- **`01_window_bound_scan.cpp`** (stdout: `"1 10 2"`, 14 steps):
  - `main` holds shadowed `loBound = 10, hiBound = 2` while `clampProbe` holds `loBound = 1, hiBound = 2, probeVal = 2`.
  - Step 3 (`if (loBound > hiBound)`): evaluates **active callee** `loBound = 1, hiBound = 2` (`1 > 2 -> Sai (false)`), ignoring caller `(10, 2)`.
  - Step 4 (`while (loBound < hiBound)`): evaluates `1 < 2 -> Đúng (true)` (loop body next).
  - Step 6 (`} else if (probeVal < hiBound && loBound >= 0)`): falls back honestly to compound `phức hợp` explanation without guessing.
  - Step 8 (`while (loBound < hiBound)` after `hiBound` decrements): evaluates `1 < 1 -> Sai (false)` (loop exit next).
- **`02_bool_flag_countdown.cpp`** (stdout: `"2"`, 21 steps):
  - Step 2 (`if (!isArmed)` with `isArmed = true`): evaluates `!isArmed (!true) -> Sai (false)`.
  - Step 3 (`while (remCount > 0)` with `remCount = 2`): evaluates `2 > 0 -> Đúng (true)`.
  - Step 14 (`while (remCount > 0)` after decrement to `0`): evaluates `0 > 0 -> Sai (false)`.
  - Step 15 (`if (isArmed == false)` with `isArmed = false`): evaluates `false == false -> Đúng (true)`.

---

## 5. Changed Files & Verification Matrix

### Modified / Added Files
- `server/src/normalizer/dsaNormalizer.ts` — Added `extractControlStatement`, `resolveActiveFrame`, `resolveIntegerOperand`, `resolveBooleanVariable`, `evaluateControlCondition`, active-frame pointer scoping, and prospective M2.4 condition semantics.
- `tests/m24ControlFlowTests.js` — 8 adversarial unit tests (factorial `n=4`/`n=1`, `==` vs `<` vs `<=`, `while` true/false + `for` init/incr boundary, nested/shadowed caller isolation, uninitialized/type/signed-unsigned fallback, compound/array/call/assignment fallback, `bool`/negative literals/`else if`, truncated end-of-trace timing).
- `tests/runAllTests.js` — Wired `runM24ControlFlowTests` into `npm test`.
- `tests/fixtures/m2_4/01_window_bound_scan.cpp`, `tests/fixtures/m2_4/02_bool_flag_countdown.cpp` — Fresh C++17 native acceptance fixtures.
- `tests/m24AcceptanceTests.js`, `tests/browserSmokeM2_4.js`, `package.json` — Real GDB & headless Chrome M2.4 acceptance scripts (`npm run test:m2-4`, `npm run test:browser:m2-4`).

### Verification Results (All Run on Local Worktree After Final Edit)
| Check | Scope | Result |
| :--- | :--- | :--- |
| `npm run build` | Server TS + WindowsJobRunner + Client Vite build | **PASS** (exit 0) |
| `npm --prefix client test -- --run` | Client Vitest (7 files) | **67 / 67 PASS** |
| `npm test` (`tests/runAllTests.js`) | 17 baseline + 13 normalizer + 37 M2.1 explanations + 8 M2.4 control-flow + 21 memory invariants + 67 client assertions | **163 / 163 PASS** |
| `npm run test:m2-4` | M2.4 unit tests (8/8) + real native C++/GDB fixtures (14 + 21 steps) | **PASS** |
| `npm run test:browser:m2-4` | Real Chrome M2.4 UI verification + screenshots | **PASS** (3 screenshots saved) |
| `npm run test:eval` | Frozen M2.3 10 fixtures / 40 checkpoints / N1 & N2 | **40 / 40 non-WRONG** (`22 CORRECT, 17 GENERIC, 1 UNSUPPORTED`, `N1=true, N2=true`) |
| `npm run test:eval:corruption` | Adversarial evaluator corruption tests | **11 / 11 PASS** |
| `npm run test:browser` .. `test:browser:m2-3` | All 6 M1–M2.3 Chrome acceptance suites | **6 / 6 PASS** |

---

## 6. Known Limitations & Recommendation
- Compound predicates (`&&`, `||`), array/struct indexing inside conditions, function calls, floating-point comparisons, non-empty `for (init; cond; incr)` headers, and arbitrary pointer `!= nullptr` predicates outside the existing M2.2 pointer list intentionally remain `GENERIC`.
- Signed/unsigned integer comparisons where either operand is unsigned and either value is negative intentionally fall back to `GENERIC` to avoid silent C++ promotion mismatches.
- **Recommendation:** **GO** — ready for PR review against `df8b0e9cd06c5316066cfb64ea14b128e24236e8`.
