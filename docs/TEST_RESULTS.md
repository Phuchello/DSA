# DSA FlowLab: Test Results & Verification Log

**Last Run:** 2026-10-20  
**Environment:** Windows MinGW-w64 GCC 16.1.0, GDB 17.2, Node.js v24.19.0

## Test Matrix

| Test ID | Test Category | Target Program | Input (`stdin`) | Expected Output | Actual Output | Status |
|---|---|---|---|---|---|---|
| TC-ENG-01 | Baseline Engine | `test.cpp` (InsertTail) | N/A | Done | Done | PASS |
| TC-GOLDEN-01 | IT003 TimKiemVaXoa | Standard List (delete 3) | `7\n3 0 8 2 3 4 7\n3` | `0 8 2 4 7` | Pending E2E test | PENDING |
| TC-EDGE-01 | IT003 Edge Cases | Not found (`k=3`) | `3\n2 4 7\n3` | `-1` | Pending E2E test | PENDING |
| TC-EDGE-02 | IT003 Edge Cases | Delete Head | `3\n3 0 8\n3` | `0 8` | Pending E2E test | PENDING |
| TC-EDGE-03 | IT003 Edge Cases | Delete Tail | `3\n0 8 3\n3` | `0 8` | Pending E2E test | PENDING |
| TC-EDGE-04 | IT003 Edge Cases | Consecutive Matches | `5\n3 3 4 3 3\n3` | `4` | Pending E2E test | PENDING |
| TC-EDGE-05 | IT003 Edge Cases | All Matches | `3\n3 3 3\n3` | Empty list / Head=Tail=null | Pending E2E test | PENDING |
| TC-EDGE-06 | IT003 Edge Cases | Empty List | `0\n3` | `-1` | Pending E2E test | PENDING |
| TC-EDGE-07 | IT003 Edge Cases | Single Element Match | `1\n3\n3` | Empty list | Pending E2E test | PENDING |
| TC-EDGE-08 | IT003 Edge Cases | Single Element Miss | `1\n7\n3` | `-1` | Pending E2E test | PENDING |

---
*Logs are continuously updated as automated tests execute.*
