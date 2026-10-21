# Ghi chú bảo mật — DSA FlowLab P0

## Phạm vi an toàn

Backend mặc định bind `127.0.0.1`; CORS cho allowlist origin localhost. Host header parse URL và so khớp hostname chính xác: `localhost`, `127.0.0.1`, `[::1]`. Candidate regression test: `localhost:4000` → HTTP 200 và `localhost.attacker.example:4000` → HTTP 403; PASS trong [run 39586265810](https://github.com/Phuchello/DSA/actions/runs/39586265810).

Body, source, stdin, compile/debug duration và concurrency có giới hạn ứng dụng. Các biện pháp này giảm một số rủi ro cấu hình/tải nhưng không cô lập mã. Denylist không thể bao quát mọi API hệ thống; timeout không giới hạn toàn diện CPU/RAM/filesystem/side effects. C++ chạy trên host với quyền hiện tại.

## Điều kiện sử dụng/phát hành

- Chỉ chạy code đáng tin cậy trên máy local.
- Giữ backend loopback; không đặt `HOST=0.0.0.0`, port-forward, reverse proxy hoặc tunnel.
- Không deploy `/api/run` công khai hoặc multi-tenant; không phân phối binary runner.
- Không mô tả CORS, Host guard, denylist, limits hoặc timeout là sandbox.
- Cần cô lập OS/microVM được đánh giá trước khi nhận code không tin cậy.

Không thay đổi execution-security restrictions trong candidate.
