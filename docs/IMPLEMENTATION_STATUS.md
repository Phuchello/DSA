# DSA FlowLab: Trạng thái kiểm toán chất lượng P0

**Cập nhật:** 21/10/2026  
**Nhánh:** `dev/flowlab-p0`  
**Code commit:** [7b14b049ceda4e388b71d25665c93560b7805f6b](https://github.com/Phuchello/DSA/commit/7b14b049ceda4e388b71d25665c93560b7805f6b)  
**GitHub Actions:** [run 39533219152](https://github.com/Phuchello/DSA/actions/runs/39533219152) — Linux PASS, Windows PASS.

## Gate P0

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Stdout theo dòng thời gian | PASS local | Snapshot trước câu `cout` không chứa sentinel từ câu đó; `finalStdout` giữ output thực sau khi chương trình thoát. Không còn backfill vào năm snapshot trước. |
| Quyền sở hữu request/trace | PASS local | Bản chụp code + stdin và request ID; đổi stdin trong request pending không làm trace thành hiện tại. Response cũ đến sau bị bỏ qua. |
| Automated frontend tests | PASS local | `npm --prefix client test`: 14/14, gồm hai regression test concurrency và test nhãn output cuối. |
| Automated backend/native tests | PASS local | `npm test`: 52/52 assertions; golden 161 snapshot, baseline 13/13, normalizer 8/8, memory invariants 17/17, client 14 assertions qua MI-12. |
| Real-browser smoke | PASS local | Headless Chrome chạy app với backend loopback thật; output `0 8` và `7`, timeline tiến/lùi, chain/pointers, mode Beginner/Advanced, stale trace. |
| GitHub Actions Linux | PASS | Run 39533219152: client build/typecheck, 14 Vitest tests, server build và 8 normalizer tests. |
| GitHub Actions Windows | PASS | Run 39533219152: full build; 52/52 assertions, gồm stdout chronology, golden, MI-09, MI-14 và MI-12. |

## Chi tiết runtime

Trace giữ `snapshotConvention: before-statement`; mỗi trường `stdout` chỉ là dữ liệu đã quan sát lúc snapshot. Phần stdout chưa flush đến khi inferior kết thúc được truyền bằng `finalStdout` riêng và hiển thị dưới nhãn “Đầu ra cuối cùng sau khi chương trình kết thúc”.

`traceSource` ghi chính xác code và stdin đã tạo trace. `isTraceStale` được suy ra bằng cách so sánh bản chụp đó với editor hiện tại. Request ID bảo vệ khỏi kết quả đến sai thứ tự; response cũng bị bỏ nếu input hiện tại không còn khớp.

## Phạm vi triển khai

P0 runtime correctness không đồng nghĩa với an toàn triển khai công khai. Runner tiếp tục gọi g++/gdb trên host; cần sandbox cô lập ở mức OS hoặc microVM trước khi nhận mã C++ từ nhiều tenant không tin cậy.
