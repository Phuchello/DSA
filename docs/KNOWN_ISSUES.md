# DSA FlowLab — Giới hạn đã biết

Evidence hiện tại thuộc code candidate [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed). Linux và Windows/native/Chrome PASS trong [CI run 39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961). Browser evidence: [artifact 12348299743](https://github.com/Phuchello/DSA/actions/runs/39606982961/artifacts/12348299743), giữ đến 04/11/2026 13:24:07 UTC.

## An toàn thực thi

Backend chạy g++/GDB với quyền của tài khoản host. Static filter, giới hạn kích thước/thời gian/concurrency, CORS, Host validation, loopback mặc định và process-tree cleanup **không tạo sandbox**. Chỉ chạy code tin cậy local; không public hoặc multi-tenant trước khi có OS-level isolation/microVM phù hợp. Nếu không xác minh được process-tree shutdown, request báo lỗi unverified; không được coi là cleanup thành công.

## Phạm vi trace

Visualizer theo dõi một tập con C++ và ưu tiên các luồng linked-list đã kiểm thử. Nó không phải debugger tổng quát. Số snapshot có thể khác theo compiler, GDB và OS; contract là các semantics/topology được kiểm tra chứ không phải byte-identical trace. Heap NODE chỉ được xác nhận khi GDB quan sát được địa chỉ trả về từ allocator; thiếu evidence thì location/relationship có thể là `unknown`. Buffered stdout chỉ gắn với bước khi quan sát được; output flush khi thoát được hiển thị riêng như final output.

## Browser và build

Real browser smoke chạy headless Chrome 155.0.8059.40 trên Windows runner với backend thật. Nó bao phủ một golden linked-list flow và các mode tiếng Việt, không bao phủ mọi browser, device, phiên bản, bài học hoặc thao tác accessibility. Browser artifact CI hết hạn sau 14 ngày.

Build hiện tạo một JavaScript chunk 725.13 kB chưa nén, vượt ngưỡng cảnh báo 500 kB của Vite; build vẫn thành công. Có thể tách chunk trong công việc tối ưu sau, không thuộc fix review P0.
