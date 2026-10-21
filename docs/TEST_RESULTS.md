# DSA FlowLab — Kết quả kiểm thử release candidate P0

**Cập nhật:** 21/10/2026  
**Branch head được xác minh:** [`9b36e90260449e99647516974abf0233d23b4a00`](https://github.com/Phuchello/DSA/commit/9b36e90260449e99647516974abf0233d23b4a00) — `dev/flowlab-p0`  
**GitHub Actions:** [run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020) — Linux PASS; Windows native C++/GDB và real Chrome PASS.  
**Browser artifact:** [browser-smoke-evidence-39578131020-1](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037) — 252,886 bytes; hết hạn 04/11/2026 09:38 UTC.

## Automated tests — CI

Run 39578131020 được gắn với đúng candidate commit 9b36e90260449e99647516974abf0233d23b4a00.

### Linux job — build, type-check và unit tests

- Client build/type-check: PASS.
- Vitest: **14/14 tests**, 4 test files PASS.
- Server TypeScript build: PASS.
- Normalizer/pointer classification: **8/8 PASS**.

### Windows job — native g++/GDB

- MSYS2 MinGW-w64 g++, GDB và Python GDB support: PASS.
- Server/client build: PASS.
- Full `npm test`: **54/54 unique assertions PASS**:
  - 15/15 baseline (13 API/runtime cases và 2 Host-header regression checks).
  - 8/8 normalizer.
  - 17/17 memory invariants.
  - 14 client assertions qua MI-12, chạy một lần trong command này.
- `TC-STDOUT-CHRONOLOGY`: PASS — snapshot trước câu `cout` không có output của chính câu đó; buffered output nằm riêng ở `finalStdout`.
- `TC-GOLDEN-01`: PASS — 161 snapshots, 7 allocation, 21 traversal, 3 unlink, 2 deallocation, 17 call, 18 return.
- MI-09 và MI-14: PASS trong bộ 17 memory invariants.
- Host regression: `localhost:4000` → HTTP 200; `localhost.attacker.example:4000` → HTTP 403.

Không cộng 14 Vitest tests của Linux vào 14 client assertions đã chạy bên trong full Windows suite; đó là hai lần chạy độc lập ở hai job.

## Real-browser smoke — Chrome thật, backend thật

Windows CI chạy Chrome headless trên `windows-latest` cùng app và g++/GDB native qua loopback. Không mock `/api/run`. Log ghi Chrome **155.0.8059.85**. Các assertions đều PASS:

- Mở app, tiếng Việt mặc định và chế độ Tập sự.
- Paste rồi edit C++ trong CodeMirror; request thực chứa source đã sửa.
- Đổi stdin sang `3\n3 0 8\n3`, chạy C++ thật và đọc stdout `0 8`.
- Điều hướng timeline tiến/lùi.
- Xem topology có node đã cấp phát và các pointer `L.pHead`, `L.pTail`, `p`.
- Chuyển sang Chuyên sâu, kiểm tra memory inspector, rồi quay lại Tập sự.
- Khi request thứ hai còn pending, đổi stdin từ `1\n7\n3` sang `1\n8\n3`. Response thật của input cũ trả stdout `7` nhưng không làm trace hiện tại hết stale và không ghi đè output.
- Chạy lại input hiện tại, nhận stdout `8`, stale marker được xóa.
- Không có runtime exception hoặc console error trong trình duyệt.

Artifact giữ structured JSON evidence, log Chrome/server/Vite, response trace đầu tiên và screenshots topology, Advanced view, pending stale trace, current trace. Upload bước artifact PASS, 252,886 bytes; retention 14 ngày.

## Bằng chứng trước đó

Run [39541439517](https://github.com/Phuchello/DSA/actions/runs/39541439517) xanh trên commit trước candidate. Candidate mới đã chạy lại toàn bộ matrix ở run 39578131020; chỉ dùng run 39578131020 làm bằng chứng cho Host fix và version metadata.

## Giới hạn còn lại

- Runner biên dịch/chạy C++ trên host; **không phải sandbox** và chỉ dành cho code đáng tin cậy tại local. Không mở API ra Internet hoặc dùng multi-tenant.
- Visualizer hỗ trợ một tập con trạng thái C++ và các tình huống đã kiểm thử; không khẳng định tương thích phổ quát.
- Stdout đã flush được ghi theo thời điểm quan sát; buffered output khi thoát chỉ có nhãn output cuối, không có thời điểm câu lệnh chính xác.
- Browser smoke là headless Chrome trên một luồng golden linked-list; không thay visual review trên màn hình vật lý hoặc matrix nhiều browser/thiết bị/bài học.
- Phiên bản Chrome đi theo hosted runner image, không pin cố định.
