# DSA FlowLab v0.1.0-p0 — Web P0

**Trạng thái:** prerelease đã chuẩn bị để review; chưa có tag hoặc GitHub Release.  
**Ngôn ngữ mặc định của ứng dụng:** tiếng Việt.

## Mục tiêu và tính năng

DSA FlowLab giúp sinh viên quan sát một số luồng chạy C++ và cấu trúc dữ liệu theo từng bước trong trình duyệt; P0 tập trung vào các ví dụ đã kiểm thử, đặc biệt là danh sách liên kết đơn. Đây không phải debugger C++ phổ dụng.

- Biên dịch và chạy ví dụ bằng g++/GDB bản địa; nhận stdin và tạo trace theo dòng nguồn.
- Quan sát stack frame, biến, pointer, heap, địa chỉ và topology `pHead`, `pTail`, `pNext`, con trỏ duyệt.
- Snapshot dùng ngữ nghĩa trước câu lệnh. Stdout ghi tại snapshot chỉ gồm dữ liệu tracer quan sát được; byte flush khi thoát nằm riêng trong output cuối.
- Điều khiển timeline tiến/lùi; chuyển giữa chế độ Tập sự và Chuyên sâu bằng tiếng Việt.
- Trace lưu snapshot code/stdin và request ID để response cũ không thể ghi đè trace mới hơn.
- Giới hạn kích thước source/stdin, thời gian compile/run và số execution đồng thời; Host header so khớp chính xác hostname loopback.

## Môi trường cục bộ

README yêu cầu Node.js 18 trở lên; CI build trên Node.js 22. Cần g++ và GDB có Python scripting. Windows CI dùng MSYS2 MinGW-w64 64-bit. Linux CI xác minh build/type-check/unit tests; native integration và real Chrome được kiểm tra trong job Windows.

```bash
npm ci
npm --prefix server ci
npm --prefix client ci
npm run build
npm run dev
```

Mở `http://127.0.0.1:5173`. Backend mặc định bind loopback `127.0.0.1`. Chỉ chạy mã C++ đáng tin cậy trên máy cục bộ.

## Kiểm thử

Run mới nhất trước candidate là [39541439517](https://github.com/Phuchello/DSA/actions/runs/39541439517) trên `b50bc14451cde1a11687e2b0b2fc005cf07963ae`; Linux và Windows + real Chrome đều xanh. Thay đổi Host validation và phiên bản package của candidate đang chờ CI mới; không dùng run cũ để khẳng định các thay đổi đó đã được kiểm tra.

## Giới hạn

- Chỉ một tập con trạng thái C++ được diễn giải; không khẳng định tương thích mọi chương trình/compiler/kiểu dữ liệu.
- Thời điểm stdout chỉ chính xác tới dữ liệu tracer quan sát; stdout bị buffer đến lúc thoát được hiển thị riêng.
- Browser smoke headless tập trung vào luồng golden linked-list; chưa bao phủ mọi bài học, trình duyệt, phiên bản, thiết bị hoặc kích thước màn hình.
- Số bước và thông tin debug có thể khác theo compiler/GDB; deallocation thiếu bằng chứng rõ ràng được phân loại bảo thủ.

## Cảnh báo native runner

Runner biên dịch và chạy C++ trên host với quyền của tiến trình hiện tại. Bộ lọc mẫu, CORS, Host validation, timeout, giới hạn và bind localhost mặc định **không phải sandbox**. Không chạy mã không tin cậy, không mở `/api/run` ra Internet hoặc multi-tenant, và không phát hành binary runner. Cần cô lập mức OS hoặc microVM trước khi chấp nhận mã không tin cậy.

## P1 — công việc tương lai, không nằm trong prerelease này

- Cô lập mã bằng cơ chế OS/microVM đã được đánh giá.
- Mở rộng phạm vi cú pháp C++ và coverage trên compiler/GDB.
- Mở rộng ma trận browser/device và visual review trên thiết bị thật.
- Nghiên cứu định vị chính xác hơn stdout khi chương trình dùng buffering.
