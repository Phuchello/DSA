# DSA FlowLab: Hạn chế kỹ thuật đã biết — Round 3

**Cập nhật:** 21/10/2026

## 1. Môi trường thực thi

Runner thực thi C++ trực tiếp qua `g++` và `gdb` bản địa của máy chủ, kèm lọc tĩnh, giới hạn kích thước, timeout và giới hạn số execution đồng thời. Các lớp này không tạo sandbox an toàn cho môi trường public multi-tenant. Không triển khai công khai trước khi có cô lập tiến trình mức hệ điều hành hoặc microVM.

CORS whitelist và Host header kiểm soát truy cập local, nhưng không thay thế sandbox thực thi mã.

## 2. Giới hạn trace

Mặc định trace tối đa 1000 snapshot (`FLOWLAB_MAX_STEPS`). Trace vượt giới hạn phải có `terminationStatus: 'truncated'` và event cuối là `truncated`.

Số snapshot có thể khác nhau giữa compiler/GDB do source line tables và stepping behavior. Golden test kiểm tra các thao tác thiết yếu, không đặt ngưỡng tổng số snapshot cố định.

## 3. Độ tin cậy bộ nhớ

Con trỏ không thuộc heap NODE mà không có bằng chứng thu hồi được phân loại `unknown`. Deallocation chỉ được ghi `freed` khi candidate khớp NODE allocation đang sống, nguồn gọi là user code và breakpoint xác nhận `operator delete` đã return. Nếu evidence không đủ, địa chỉ không được đánh dấu freed.

Round 3 đã có kết quả local Windows PASS, nhưng run CI nền `39438217969` thất bại ở MI-09 và MI-14. Chưa xác nhận sửa đổi trên Windows CI mới; trạng thái kiểm toán vẫn **NO-GO**.

## 4. Windows Application Control

Windows có thể từ chối thực thi một binary tạm do Application Control policy. Khi GDB không thể khởi chạy binary, run phải báo lỗi trace rỗng và test phải fail. Local full suite có một lần gặp lỗi này; lần chạy đầy đủ kế tiếp hoàn tất 48/48. Không được xem lần bị chặn là PASS hoặc inconclusive.
