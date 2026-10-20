# DSA FlowLab: Known Issues & Technical Limitations (Round 2)

**Phiên bản:** Web P0 Independent Audit Remediation — Round 2  
**Cập nhật lần cuối:** 20/10/2026  

## 1. Môi trường Thực thi & Hạn chế Hệ thống

### 1.1 Khả năng Cách ly Container khi Triển khai Public
- **Hiện trạng:** Runner thực thi trực tiếp qua `g++` và `gdb` bản địa của máy chủ, được bảo vệ bằng các lớp lọc tĩnh (cấm thư viện độc hại, cấm hàm shell), giới hạn tải (1MB body, 50k ký tự code, 20k ký tự stdin), giới hạn luồng thực thi đồng thời (`MAX_CONCURRENT_EXECUTIONS = 8`), và timeout (20s).
- **Hạn chế:** Không được triển khai công khai (public internet multi-tenant) runner này khi chưa bổ sung sandbox cô lập tiến trình mức nhân (như Linux seccomp/AppArmor, gVisor, hoặc microVM) theo lộ trình kiến trúc đã nêu trong `ARCHITECTURE.md`.
- **Phòng vệ cục bộ:** Đã bổ sung CORS whitelist nghiêm ngặt (chỉ chấp nhận `localhost` và `127.0.0.1`) và middleware xác thực Host header nhằm ngăn chặn các kỹ thuật tấn công DNS rebinding từ trình duyệt.

### 1.2 Giới hạn Bước thực thi (Trace Ceiling)
- **Hiện trạng:** Động cơ giới hạn ở 1000 bước thực thi (`MAX_STEPS = 1000`, có thể cấu hình qua biến môi trường `FLOWLAB_MAX_STEPS`).
- **Xử lý:** Khi vượt trần số bước, hệ thống dừng an toàn với trạng thái `terminationStatus: 'truncated'` và sự kiện bước cuối là `truncated`, hiển thị thông điệp sư phạm rõ ràng cho sinh viên thay vì báo lỗi không xác định.

### 1.3 Cơ chế Phân biệt Con trỏ Lơ lửng & Con trỏ Không rõ
- **Hiện trạng:** Sau khi gọi `operator delete`, con trỏ trỏ tới vùng nhớ đã thu hồi được phân loại chính xác là `freed`.
- **Con trỏ không phải NODE:** Các con trỏ kiểu cơ sở (như `int*`, `char*`) không nằm trong đồ thị NODE được phân loại là `unknown` thay vì bị gán nhầm là `dangling`, loại bỏ hoàn toàn các cảnh báo rác gây hoang mang cho người học.

### 1.4 Windows Application Control (WDAC / SmartScreen)
- **Hiện trạng:** Trên Windows 11 có antivirus hoặc SmartScreen quét file `.exe` mới sinh trong thư mục tạm, tiến trình `start` của GDB có thể bị từ chối tạm thời trong vài giây đầu.
- **Giải pháp:** `tracer.py` triển khai vòng lặp thử lại thông minh với 25 lần thử (`sleep 0.25s`) cho `start` và 15 lần cho `run main`, triệt tiêu hoàn toàn lỗi chập chờn khi chạy kiểm thử dồn dập.
