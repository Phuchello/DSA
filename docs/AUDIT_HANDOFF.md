# DSA FlowLab: Independent Audit Remediation & Handoff Report (Round 2)

**Ngày cập nhật:** 20/10/2026  
**Kho lưu trữ chính thức:** https://github.com/Phuchello/DSA  
**Nhánh triển khai:** `dev/flowlab-p0`  
**Trạng thái kiểm toán:** HOÀN TẤT KHẮC PHỤC LỖI AUDIT ROUND 2 — SẴN SÀNG NGHIỆM THU (AUDIT REMEDIATED — GO)

---

## 1. Tóm Tắt Khắc Phục Lỗi Audit Độc Lập — Vòng 2

Dựa trên yêu cầu kiểm toán vòng 2 đối với commit `3e6c95079a023ca803afa52c4294274a9627e58e`, các lỗi kỹ thuật đã được khắc phục hoàn toàn:

### Mục A: Khắc phục GitHub Actions CI
- Khắc phục lỗi `Dependencies lock file is not found`: Tạo và cam kết `package-lock.json` chuẩn tại thư mục gốc workspace.
- Cấu hình CI thành 2 luồng công việc rõ ràng:
  - **Job 1 (Linux `ubuntu-latest`):** Cài đặt phụ thuộc bằng `npm ci`, kiểm tra kiểu dữ liệu (TypeScript tsc), build client & server, chạy bộ kiểm thử UI/Localization Vitest và Normalizer Unit Tests.
  - **Job 2 (Windows `windows-latest`):** Khởi tạo công cụ biên dịch MSYS2 MinGW (`mingw-w64-x86_64-gcc`, `mingw-w64-x86_64-gdb`, `mingw-w64-x86_64-python`), kiểm tra rõ ràng Python-enabled GDB bằng lệnh `gdb -batch -ex "python import sys; print('GDB_PYTHON_OK:', sys.version)"`, thực thi toàn bộ 37 bài kiểm tra tích hợp backend và bất biến bộ nhớ.
- Cờ biên dịch `-mconsole` được phân nhánh điều kiện chỉ chạy trên nền tảng Windows (`process.platform === 'win32'`), loại bỏ trên Linux.

### Mục B: Ngữ nghĩa Vết Thực Thi Bộ Nhớ (Memory Trace Semantics)
- Thay thế hoàn toàn cơ chế nhận diện `delete` bằng chuỗi regex nguồn bằng cơ chế runtime debugger `DeallocationBreakpoint`:
  - Hook các hàm `operator delete(void*, unsigned long long)`, `operator delete(void*)`, `operator delete[](...)` ở mức thanh ghi CPU (`rcx` trên Windows x64, `rdi` trên Linux x64).
  - Không hook C `free` để tránh nhầm lẫn với các thao tác cấp phát/giải phóng bộ đệm nội bộ của thư viện chuẩn CRT/iostream.
  - Loại bỏ hoàn toàn dương tính giả trên các câu lệnh điều kiện như `if (flag == 1) delete n;` khi nhánh không được thực thi.
  - Bảo toàn chặt chẽ quy ước **Before-statement snapshot**: node chỉ chuyển sang trạng thái `freed` sau khi câu lệnh giải phóng đã thực sự được CPU thực thi ở bước kế tiếp.

### Mục C: Sửa Chữa Phân Loại Con Trỏ (Pointer Classification)
- Khắc phục tình trạng con trỏ không thuộc đồ thị NODE (ví dụ con trỏ kiểu cơ sở `int*`, `char*`) bị phân loại nhầm thành dangling pointer.
- Phân biệt rõ ràng 6 trạng thái con trỏ:
  - `valid`: Con trỏ trỏ tới địa chỉ NODE hợp lệ đang hoạt động trên Heap.
  - `null`: Con trỏ `nullptr` hoặc địa chỉ `0x0`.
  - `freed`: Con trỏ trỏ tới ô nhớ đã bị thu hồi bởi `operator delete`.
  - `dangling`: Con trỏ trỏ tới địa chỉ bất hợp lệ có bằng chứng xác thực.
  - `uninitialized`: Con trỏ chưa khởi tạo trên stack.
  - `unknown`: Con trỏ trỏ tới địa chỉ ngoài đồ thị NODE mà không có bằng chứng đã giải phóng (tránh dương tính giả).

### Mục D: Thực Thi Kiểm Định Schema Chặt Chẽ (Enforce Trace Schema)
- Khắc phục việc âm thầm sử dụng dữ liệu thô chưa kiểm chứng:
  - Runner kiểm định tệp vết thô bằng `RawTraceFileSchema.safeParse`. Tệp vết bị hỏng sẽ trả về lỗi xác thực rõ ràng.
  - Normalizer kiểm định từng bước thực thi bằng `RawExecutionPointSchema.safeParse`. Nếu một bước bị lỗi cấu trúc, normalizer phát sinh một nút sự kiện `schema_error` có kiểm soát thay vì bỏ qua âm thầm.

### Mục E: Củng Cố Toàn Diện Bộ Kiểm Thử
- **MI-08 (Address Reuse):** Kiểm chứng trung thực thực tế cấp phát lại ô nhớ (nếu allocator tái sử dụng địa chỉ thì thế hệ `generation` tăng lên 2 và định danh node cũ/mới độc lập). Đồng thời kiểm chứng qua fixture tất định tại unit test.
- **Bổ sung các bài kiểm tra mới:**
  - `MI-13`: Con trỏ không phải NODE được phân loại là `unknown`, không phải `dangling`.
  - `MI-14`: Câu lệnh xóa có điều kiện (`if (flag == 1) delete n;`), kiểm chứng khi `flag == 0` node không bao giờ bị giải phóng nhầm; khi `flag == 1` node được giải phóng chính xác sau bước chạy.
  - `MI-15`: Lỗi biên dịch C++ trả về `success: false`, `trace: []` và thông báo lỗi rõ ràng của compiler.
  - `MI-16`: Xác thực Schema từ chối dữ liệu vết lỗi và phát sinh `schema_error`.
  - `MI-17`: Truncated trace do vòng lặp dài được gắn nhãn `terminationStatus: 'truncated'` và sự kiện `truncated` rõ ràng.

### Mục F: An Ninh Thực Thi Cục Bộ
- Giới hạn CORS nghiêm ngặt vào các origin phát triển cục bộ (`localhost:5173`, `127.0.0.1:5173`, `localhost:4000`, `127.0.0.1:4000`).
- Bổ sung middleware kiểm tra Host header chống tấn công DNS rebinding.
- Tài liệu hóa trung thực: Runner hiện tại là môi trường cục bộ phục vụ học tập, không phải sandbox multi-tenant trên môi trường đám mây công khai.

---

## 2. Hướng Dẫn Kiểm Thử & Chạy Nghiệm Thu

```bash
# 1. Chạy toàn bộ 37 bài kiểm thử tự động backend (Baseline + Normalizer Unit + Invariants)
npm test

# 2. Chạy bộ kiểm thử UI và Bản địa hóa (Vitest)
npm --prefix client test

# 3. Biên dịch toàn bộ Client và Server
npm run build
```

---

## 3. Khuyến Nghị Nghiệm Thu

- **Khuyến nghị:** **GO (CHẤP THUẬN NGHIỆM THU P0 — ROUND 2)**.
- **Tiêu chuẩn thành công:** Hệ thống hoạt động tin cậy, không còn lỗi nhận diện cấp phát giả, topo con trỏ bám sát thực thi thực tế của CPU/GDB, 48/48 test tự động đạt 100%.
