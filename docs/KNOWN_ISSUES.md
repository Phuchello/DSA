# DSA FlowLab: Hạn chế kỹ thuật đã biết — Round 3

**Cập nhật:** 21/10/2026

## 1. Môi trường thực thi

Runner thực thi C++ trực tiếp qua g++ và gdb bản địa của máy chủ, kèm lọc tĩnh, giới hạn kích thước, timeout và giới hạn execution đồng thời. Các lớp này không tạo sandbox an toàn cho public multi-tenant. Chưa triển khai công khai; cần process isolation mức hệ điều hành hoặc microVM trước.

CORS whitelist và Host header kiểm soát truy cập local, nhưng không thay thế sandbox thực thi mã.

## 2. Giới hạn trace

Mặc định trace tối đa 1000 snapshot (FLOWLAB_MAX_STEPS). Trace vượt giới hạn phải có terminationStatus: 'truncated' và event cuối là truncated.

Số snapshot có thể thay đổi theo compiler/GDB và source line stepping. GitHub Actions run [39530079680](https://github.com/Phuchello/DSA/actions/runs/39530079680) đã PASS semantic completeness trên Windows GCC 15.2/GDB 17.1 và Linux. Golden test kiểm tra allocation, traversal, unlink, deallocation, call/return và các thay đổi quan sát được; không đặt ngưỡng snapshot cố định.

## 3. Độ tin cậy bộ nhớ

Con trỏ ngoài heap NODE hoặc deallocation thiếu bằng chứng được phân loại thận trọng là unknown. Trạng thái freed chỉ được ghi khi candidate khớp NODE allocation đang sống, source call thuộc user code và breakpoint xác nhận operator delete đã return. Các invariant MI-01–MI-17 đều PASS trong Windows CI run 39530079680.

## 4. Windows Application Control

Windows có thể chặn một binary tạm do Application Control policy. Khi GDB không khởi chạy được binary, runner trả lỗi trace và test phải fail. Không được tính trạng thái này là PASS hoặc inconclusive. Một lần local rerun sau kết quả 48/48 trước đó gặp block lặp lại và đã dừng; CI Windows hiện tại hoàn tất thành công.
