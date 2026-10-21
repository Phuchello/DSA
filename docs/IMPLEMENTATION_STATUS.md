# DSA FlowLab: Trạng thái kiểm toán chất lượng P0

**Candidate commit:** [`9b36e90260449e99647516974abf0233d23b4a00`](https://github.com/Phuchello/DSA/commit/9b36e90260449e99647516974abf0233d23b4a00)  
**GitHub Actions:** [run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020) — cả hai job PASS.  
**Browser evidence:** [artifact 12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037).

## Gate P0

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Stdout chronology | PASS | Snapshot trước `cout` không chứa output chưa thực thi; buffered output ở `finalStdout`. |
| Trace/request ownership | PASS | Immutable code/stdin snapshot + request ID; response cũ không ghi đè trace hiện tại. |
| Host-header validation | PASS | Localhost trả HTTP 200; `localhost.attacker.example` trả HTTP 403. |
| Linux CI | PASS | Client build/type-check, 14 Vitest tests, server build, 8 normalizer tests. |
| Windows native CI | PASS | 54/54 unique assertions; 15 baseline, 8 normalizer, 17 invariants, 14 client assertions qua MI-12. |
| Golden/MI coverage | PASS | Golden trace 161 snapshots; MI-09 recursion và MI-14 conditional delete được xác minh. |
| Real Chrome | PASS | Chrome thật + native g++/GDB; editor/stdin/stdout, pointer topology, timeline, tiếng Việt, stale-response protection. |
| Artifact retention | PASS | [12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037), upload thành công, retention 14 ngày. |

Số 14 Vitest tests ở Linux là một lần chạy riêng; không cộng vào 14 client assertions đã chạy một lần bên trong Windows full suite.

## Bằng chứng runtime

Trace giữ `snapshotConvention: before-statement`. Output chỉ xuất hiện tại snapshot khi tracer quan sát được; buffered output sau khi inferior thoát nằm ở `finalStdout` với nhãn “Đầu ra cuối cùng sau khi chương trình kết thúc”. Trace source lưu code/stdin; stale state được so với editor hiện tại.

## Phạm vi và giới hạn

P0 là công cụ học tập local cho tập con C++ đã kiểm thử, đặc biệt là linked-list golden flow. Không tuyên bố C++ phổ quát hoặc an toàn để chạy mã không tin cậy. Browser smoke chỉ bao phủ một luồng headless Chrome; xem [KNOWN_ISSUES](KNOWN_ISSUES.md).
