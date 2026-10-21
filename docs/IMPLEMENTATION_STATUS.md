# DSA FlowLab: Trạng thái kiểm toán chất lượng P0

**Cập nhật:** 21/10/2026  
**Nhánh:** `dev/flowlab-p0`  
**Implementation commit:** [a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec](https://github.com/Phuchello/DSA/commit/a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec)  
**GitHub Actions:** [run 39540945050](https://github.com/Phuchello/DSA/actions/runs/39540945050) — Linux PASS, Windows + browser PASS.

## Gate P0

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Stdout theo dòng thời gian | PASS local | Snapshot trước câu `cout` không chứa sentinel từ câu đó; `finalStdout` giữ output thực sau khi chương trình thoát. Không còn backfill vào năm snapshot trước. |
| Quyền sở hữu request/trace | PASS local | Bản chụp code + stdin và request ID; đổi stdin trong request pending không làm trace thành hiện tại. Response cũ đến sau bị bỏ qua. |
| Automated frontend tests | PASS local | `npm --prefix client test`: 14/14, gồm hai regression test concurrency và test nhãn output cuối. |
| Automated backend/native tests | PASS local | `npm test`: 52/52 assertions; golden 161 snapshot, baseline 13/13, normalizer 8/8, memory invariants 17/17, client 14 assertions qua MI-12. |
| Real-browser smoke | PASS local + CI | Real Chrome 155.0.8059.85 local / 155.0.8059.40 CI against the C++/GDB backend; stdout `0 8`, pending old stdout `7` ignored after stdin edit, matching stdin produces `8`; timeline, nodes, `p`/`pHead`/`pTail`, Vietnamese Beginner/Advanced verified. |
| GitHub Actions Linux | PASS | Run 39540945050: client build/typecheck, 14 Vitest tests, server build and 8 normalizer tests. |
| GitHub Actions Windows + browser | PASS | Run 39540945050: full build; 52/52 assertions, including stdout chronology, golden, MI-09, MI-14 and MI-12; Chrome smoke also PASS. [Evidence artifact](https://github.com/Phuchello/DSA/actions/runs/39540945050/artifacts/12318909653). |

The first browser CI attempt, [39540508595](https://github.com/Phuchello/DSA/actions/runs/39540508595), found that the harness selected an allocated-node snapshot before pointer `p` was visible. The harness now chooses a snapshot containing nodes, both endpoints, and `p` together; the assertion remains intact and the retry is green.

## Chi tiết runtime

Trace giữ `snapshotConvention: before-statement`; mỗi trường `stdout` chỉ là dữ liệu đã quan sát lúc snapshot. Phần stdout chưa flush đến khi inferior kết thúc được truyền bằng `finalStdout` riêng và hiển thị dưới nhãn “Đầu ra cuối cùng sau khi chương trình kết thúc”.

`traceSource` ghi chính xác code và stdin đã tạo trace. `isTraceStale` được suy ra bằng cách so sánh bản chụp đó với editor hiện tại. Request ID bảo vệ khỏi kết quả đến sai thứ tự; response cũng bị bỏ nếu input hiện tại không còn khớp.

## Phạm vi triển khai

P0 runtime and browser correctness pass. This does not imply public deployment safety. The runner still invokes g++/gdb on the host; OS-level or microVM isolation is required before accepting untrusted C++ from multiple tenants. The browser test is headless and exercises the golden linked-list flow; it does not cover every browser/version/device combination.

