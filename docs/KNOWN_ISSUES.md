# DSA FlowLab — Giới hạn đã biết

Code/regression candidate đã xác minh: [029520f35ed71b3b93cf2ed0f67aaadf477a15b1](https://github.com/Phuchello/DSA/commit/029520f35ed71b3b93cf2ed0f67aaadf477a15b1). PR CI [39617710282](https://github.com/Phuchello/DSA/actions/runs/39617710282) PASS trên đúng SHA; browser evidence [artifact 12353941958](https://github.com/Phuchello/DSA/actions/runs/39617710282/artifacts/12353941958), giữ đến 04/11/2026 14:38:34 UTC.

## Process ownership trên Windows

- Toolhelp snapshot + process creation-time identity phát hiện race đã tái hiện. Khi root đã thoát, late descendant có thể được nhận diện qua PID tổ tiên lịch sử nhưng ancestry được coi là không chắc chắn; runner báo cleanup unverified và không kill theo PID phỏng đoán để tránh giết process không liên quan sau PID reuse.
- Snapshot polling không phải ownership boundary nguyên tử. Descendant có thể được tạo/quan sát ngay sau lần snapshot cuối; helper không thể bảo đảm không có orphan trong mọi interleaving. Job Object với JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE chưa được thêm vì launcher hiện chưa tạo process suspended rồi assign atomically trước khi code có thể spawn child.
- Khi shutdown unverified, [cppRunner.ts](https://github.com/Phuchello/DSA/blob/029520f35ed71b3b93cf2ed0f67aaadf477a15b1/server/src/runner/cppRunner.ts#L480-L481) giữ execution slot và temp workspace để tránh xóa tài nguyên/process đang dùng. Server có thể cần operator restart; trước khi dọn workspace thủ công phải xác minh child đã dừng.
- Có một Windows PR attempt trung gian vượt phép đo 15 giây của cold process-tree setup; push run cùng SHA và latest PR run PASS, assertion vẫn được giữ nguyên. Xem [run 39617257621](https://github.com/Phuchello/DSA/actions/runs/39617257621), [run 39617249991](https://github.com/Phuchello/DSA/actions/runs/39617249991}) và latest [run 39617710282](https://github.com/Phuchello/DSA/actions/runs/39617710282}). Kết quả mới nhất PASS nhưng cold-start timing là điểm cần theo dõi trong review.

## An toàn thực thi

Backend chạy g++/GDB với quyền của tài khoản host. Static filters, size/time/concurrency limits, CORS/Host checks, loopback mặc định và process-tree cleanup **không phải sandbox**. Chỉ chạy code tin cậy local. Không public hoặc multi-tenant trước khi có OS-level isolation/microVM. CI evidence không thay đổi hạn chế này.

## Phạm vi trace, browser và build

Visualizer theo dõi tập con C++ đã kiểm thử; không phải debugger tổng quát. Semantics/topology là contract, không phải byte-identical trace giữa compiler/GDB/OS. Heap NODE chỉ xác nhận khi có evidence allocator từ GDB; thiếu evidence location/relationship có thể là unknown. Buffered stdout chỉ gắn bước khi quan sát được; output flush lúc thoát hiển thị riêng final output.

Browser smoke dùng headless Chrome 155.0.8059.40 trên Windows với backend thật; bao phủ golden linked-list flow và Vietnamese modes, không thay cho kiểm thử mọi browser/device/accessibility. Artifact CI hết hạn sau 14 ngày.

Build tạo JS chunk 725.13 kB chưa nén, vượt cảnh báo Vite 500 kB; build vẫn PASS. Code splitting không thuộc fix review này.
