# Ghi chú bảo mật — DSA FlowLab P0

## Phạm vi

Ứng dụng phục vụ học tập trên máy cá nhân; backend mặc định bind `127.0.0.1`. CORS cho phép các origin localhost đã khai báo. Host header được parse và so khớp chính xác với `localhost`, `127.0.0.1` hoặc `[::1]`. Body, source, stdin, thời gian compile/debug và concurrency có giới hạn ứng dụng.

Các biện pháp này giảm cấu hình sai và tải bất ngờ nhưng không cô lập mã. Denylist không thể bao quát mọi cách gọi hệ thống; timeout không giới hạn toàn diện CPU, RAM, filesystem hay side effect. C++ chạy bằng g++/GDB bản địa với quyền của tài khoản hiện tại.

## Yêu cầu khi dùng

- Chỉ chạy code đáng tin cậy trên máy local.
- Giữ backend loopback; không đặt `HOST=0.0.0.0`, port-forward, reverse-proxy hoặc tunnel.
- Không deploy `/api/run` công khai hay dùng trong môi trường multi-tenant.
- Không phân phối binary runner.
- Không xem CORS, Host guard, denylist, size/time/concurrency limit hoặc localhost binding là sandbox.
- Cần thiết kế và audit cô lập OS/microVM riêng trước khi cân nhắc nhận mã không tin cậy.

## Host validation

Candidate parse Host qua URL và kiểm tra hostname chính xác, thay vì prefix. Regression tests yêu cầu `localhost:4000` nhận HTTP 200 và `localhost.attacker.example:4000` nhận HTTP 403. Xem run candidate trong [TEST_RESULTS](TEST_RESULTS.md).
