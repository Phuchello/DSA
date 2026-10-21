# DSA FlowLab: Hạn chế kỹ thuật đã biết

**Cập nhật:** 21/10/2026  
**Candidate CI:** [run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020) PASS.  
**Browser artifact:** [12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037), retention 14 ngày.

## 1. Cô lập mã C++

Runner gọi g++/GDB trên host với quyền của tài khoản hiện tại. Lọc tĩnh, giới hạn kích thước, timeout, concurrency, CORS, Host validation và loopback mặc định không tạo sandbox. Chỉ chạy mã đáng tin cậy tại local. Không deploy công khai hoặc multi-tenant trước khi có cô lập OS/microVM được đánh giá.

## 2. Thời điểm stdout bị buffer

Stdout được đọc tại snapshot khi dữ liệu được flush/quan sát. Nếu chương trình flush khi thoát, tracer không gán byte đó cho câu lệnh cụ thể; byte nằm trong `finalStdout` và UI gắn nhãn output cuối. `TC-STDOUT-CHRONOLOGY` PASS trong run 39578131020.

## 3. Trace và trạng thái con trỏ

Trace gắn với snapshot code/stdin và request ID. Khi đầu vào đổi, trace trước stale; response cũ không thay trace hiện tại. Deallocation thiếu bằng chứng rõ ràng tiếp tục được phân loại bảo thủ là unknown. Golden và 17 memory invariants PASS trong run 39578131020.

## 4. Hành vi toolchain

Số bước và thông tin debug có thể đổi theo compiler/GDB. CI xác minh build trên Linux và native integration trên Windows MinGW-w64. Không tuyên bố full native trace coverage trên mọi nền tảng/toolchain.

## 5. Browser smoke scope

[Real Chrome smoke](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037) chạy headless trên Windows CI, app/backend thật, Chrome 155.0.8059.85. Artifact chứa log, JSON evidence, actual trace và screenshots; expires 04/11/2026. Coverage gồm một golden linked-list flow và race stdin. Chưa bao phủ mọi browser/version/device/lesson, và không thay thế visual review trên màn hình thật.
