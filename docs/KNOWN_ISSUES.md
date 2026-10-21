# DSA FlowLab: Hạn chế kỹ thuật đã biết

**Cập nhật:** 21/10/2026

## 1. Cô lập mã C++

Runner thực thi C++ bằng g++/gdb bản địa trên host. Lọc tĩnh, giới hạn kích thước, timeout và giới hạn execution đồng thời không tạo sandbox. Không triển khai native runner công khai hoặc multi-tenant trước khi bổ sung cô lập tiến trình mức OS hoặc microVM.

## 2. Thời điểm stdout bị buffer

Stdout được đọc tại mỗi snapshot khi dữ liệu đã được flush. Nếu chương trình chỉ flush khi thoát, tracer không thể quy kết những byte đó cho một câu lệnh cụ thể. Các byte đó được trả về qua `finalStdout` và UI gắn nhãn đầu ra cuối cùng; chúng không được chép ngược vào snapshot trước đó.

## 3. Quyền sở hữu trace

Trace gắn với đúng code và stdin đã gửi. Khi một đầu vào thay đổi, trace trước hiện trạng thái stale; response cũ hoặc response từ request ID cũ không được áp dụng. Nếu người dùng sửa rồi đưa đầu vào trở lại đúng cùng nội dung trước khi request hoàn tất, snapshot vẫn khớp và có thể được dùng.

## 4. Hành vi theo toolchain

Số snapshot có thể đổi theo compiler/GDB và line stepping. Golden test kiểm tra semantic completeness thay vì tổng bước. Trạng thái deallocation thiếu bằng chứng rõ ràng tiếp tục được phân loại bảo thủ là unknown.

## 5. Windows Application Control

Application Control có thể chặn binary tạm trên máy Windows. Khi GDB không chạy được binary, lần chạy/test phải báo lỗi; không được tính là PASS hoặc inconclusive. GitHub Actions Windows và local full suite phải được dùng làm bằng chứng riêng cho môi trường tương ứng.

## 6. Browser smoke scope

GitHub Actions runs a real headless Chrome smoke on `windows-latest` with the MSYS2 g++/GDB toolchain and keeps its log, structured evidence, actual first-run trace, and screenshots for 14 days. It covers the golden linked-list editing/run/timeline/pointer/mode flow and a pending-response stdin race. It does not replace visual review on physical displays or cover every browser version, device size, or lesson. The hosted Chrome version is recorded in the artifact but follows the runner image rather than being pinned.

