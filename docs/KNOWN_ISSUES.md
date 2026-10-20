# DSA FlowLab: Known Issues & Technical Limitations

**Phiên bản:** Web P0 Release Candidate  
**Cập nhật lần cuối:** 20/10/2026  

## 1. Môi trường Thực thi & Hạn chế Hệ thống

### 1.1 Khả năng Cách ly Container khi Triển khai Public
- **Hiện trạng:** Trong phiên bản cá nhân/local P0, runner thực thi trực tiếp qua `g++` và `gdb` bản địa của máy chủ, được bảo vệ bằng các lớp lọc tĩnh (static analysis cấm thư viện độc hại, cấm hàm shell) và hạn chế thời gian chạy (timeout 20s, giới hạn 1000 bước).
- **Hạn chế:** Không được triển khai công khai (public internet) runner này ra môi trường production khi chưa bổ sung sandbox cô lập tiến trình mức nhân (như Linux seccomp/AppArmor, gVisor, hoặc microVM) theo khuyến nghị tại Phase 0 Audit.

### 1.2 Giới hạn Bước thực thi (Trace Ceiling)
- **Hiện trạng:** Động cơ giới hạn cứng ở 1000 bước thực thi (`MAX_STEPS = 1000`).
- **Lý do:** Đảm bảo trình duyệt web không bị quá tải bộ nhớ DOM/SVG khi render các vòng lặp lớn hoặc đệ quy sâu. Nếu chương trình vượt quá 1000 bước, hệ thống sẽ dừng an toàn và thông báo người dùng rút gọn dữ liệu đầu vào.

### 1.3 Cơ chế Phân biệt Con trỏ Lơ lửng (Dangling Pointer)
- **Hiện trạng:** Sau khi gọi `delete temp;`, biến con trỏ `temp` trên khung ngăn xếp (Stack) vẫn lưu giá trị địa chỉ hex của ô nhớ cũ cho đến khi gán `temp = nullptr`.
- **Hành vi trực quan:** Visualizer phân biệt rõ ràng: biến con trỏ trên Stack vẫn còn sống, nhưng nút trên Heap được chuyển trạng thái sang `freed` (viền nét đứt đỏ). Tuyệt đối không gọi con trỏ là "đã bị giải phóng" mà gọi là con trỏ đang trỏ vào vùng nhớ đã thu hồi.

### 1.4 Windows Application Control (WDAC / SmartScreen)
- **Hiện trạng:** Trên một số máy Windows 11 có bật chính sách bảo mật ứng dụng nghiêm ngặt, việc tạo file thực thi trong thư mục `%TEMP%` có thể bị tạm khóa trong lúc antivirus quét.
- **Giải pháp đã áp dụng:** Runner tự động điều hướng thư mục tạm về `~/.dsa_flowlab_tmp` và bổ sung cơ chế thử lại (retry loop) an toàn.
