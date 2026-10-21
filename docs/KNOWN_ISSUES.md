# DSA FlowLab — Giới hạn đã biết

Code/regression candidate đã xác minh: [75cac8f64442c6230a4dc90624ef5585e8779273](https://github.com/Phuchello/DSA/commit/75cac8f64442c6230a4dc90624ef5585e8779273). PR CI [39620598658](https://github.com/Phuchello/DSA/actions/runs/39620598658) PASS trên source SHA đó. Audit-head docs-only [1d72c3b](https://github.com/Phuchello/DSA/commit/1d72c3b12190cdf8419d982ea00052524acb25c7) được kiểm tra lại ở [PR run 39621877776](https://github.com/Phuchello/DSA/actions/runs/39621877776), cả Linux/Windows-native/Chrome đều PASS; browser evidence [artifact 12355192851](https://github.com/Phuchello/DSA/actions/runs/39621877776/artifacts/12355192851), SHA-256 2f39ce5ac2ad1545c11686c45ef499cc67890bb99dee3a459f0054e6992be1c7, hết hạn 04/11/2026 15:08:23 UTC. Source code không đổi giữa hai revision.

## Process ownership trên Windows

- Toolhelp snapshot + process creation-time identity phát hiện race đã tái hiện. Khi root đã thoát, late descendant có thể được nhận diện qua PID tổ tiên lịch sử nhưng ancestry được coi là không chắc chắn; runner báo cleanup unverified và không kill theo PID phỏng đoán để tránh giết process không liên quan sau PID reuse.
- Snapshot polling không phải ownership boundary nguyên tử. Descendant có thể được tạo/quan sát ngay sau lần snapshot cuối; helper không thể bảo đảm không có orphan trong mọi interleaving. Job Object với JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE chưa được thêm vì launcher hiện chưa tạo process suspended rồi assign atomically trước khi code có thể spawn child.
- Khi shutdown unverified, [cppRunner.ts](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/server/src/runner/cppRunner.ts#L480-L481) giữ execution slot và temp workspace để tránh xóa tài nguyên/process đang dùng. Server có thể cần operator restart; trước khi dọn workspace thủ công phải xác minh child đã dừng.
- Các PR attempt trung gian [39617257621](https://github.com/Phuchello/DSA/actions/runs/39617257621) từng vượt phép đo 15 giây khi helper compile lạnh. Fix hiện tại prewarm verifier trước khi server bind và trước phép đo; assertion 15 giây không bị nới. PR run [39620598658](https://github.com/Phuchello/DSA/actions/runs/39620598658) và push run [39620589502](https://github.com/Phuchello/DSA/actions/runs/39620589502) đều PASS trên code SHA 75cac8f64442c6230a4dc90624ef5585e8779273; PR run [39621877776](https://github.com/Phuchello/DSA/actions/runs/39621877776) cũng PASS sau docs-only update. Nếu prewarm khởi động thất bại, server cảnh báo và cleanup vẫn fail-closed.

## An toàn thực thi

Backend chạy g++/GDB với quyền của tài khoản host. Static filters, size/time/concurrency limits, CORS/Host checks, loopback mặc định và process-tree cleanup **không phải sandbox**. Chỉ chạy code tin cậy local. Không public hoặc multi-tenant trước khi có OS-level isolation/microVM. CI evidence không thay đổi hạn chế này.

## Phạm vi trace, browser và build

Visualizer theo dõi tập con C++ đã kiểm thử; không phải debugger tổng quát. Semantics/topology là contract, không phải byte-identical trace giữa compiler/GDB/OS. Heap NODE chỉ xác nhận khi có evidence allocator từ GDB; thiếu evidence location/relationship có thể là unknown. Buffered stdout chỉ gắn bước khi quan sát được; output flush lúc thoát hiển thị riêng final output.

Browser smoke dùng headless Chrome 155.0.8059.40 trên Windows với backend thật; bao phủ golden linked-list flow và Vietnamese modes, không thay cho kiểm thử mọi browser/device/accessibility. Artifact CI hết hạn sau 14 ngày.

Build tạo JS chunk 725.13 kB chưa nén, vượt cảnh báo Vite 500 kB; build vẫn PASS. Code splitting không thuộc fix review này.
