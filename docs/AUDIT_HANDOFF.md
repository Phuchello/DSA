# DSA FlowLab: Independent Audit Remediation & Handoff Report

**Ngày cập nhật:** 20/10/2026  
**Kho lưu trữ chính thức:** https://github.com/Phuchello/DSA  
**Nhánh triển khai:** `dev/flowlab-p0`  
**Trạng thái kiểm toán:** HOÀN TẤT KHẮC PHỤC LỖI AUDIT — SẴN SÀNG NGHIỆM THU (AUDIT REMEDIATED — GO)

---

## 1. Tóm Tắt Khắc Phục Lỗi Audit Độc Lập

Dựa trên kết luận NO-GO tại commit `194f8895b77201eab7e83c3177e702bbe35f6d01`, toàn bộ các phát hiện lỗi kỹ thuật P0 đã được khắc phục triệt để:

### Ưu tiên 0: Trình soạn thảo C++ thực sự (Real C++ Code Editor)
- Thay thế hoàn toàn thẻ `<pre>` tĩnh trong `CodeEditor.tsx` bằng **CodeMirror 6** (`@uiw/react-codemirror`, `@codemirror/lang-cpp`, `@codemirror/theme-one-dark`).
- Hỗ trợ đầy đủ thao tác gõ mã, copy/paste, thụt lề thông minh, đánh số dòng và hiển thị dòng lệnh đang thực thi (`currentLine`) với hiệu ứng CodeMirror Extension Decoration.
- Đồng bộ hai chiều với React state `code` và `setCode`.
- Bổ sung cơ chế phát hiện vết thực thi cũ (`isTraceStale`): Khi mã nguồn hoặc stdin bị thay đổi sau khi chạy, giao diện lập tức hiển thị dải thông báo cảnh báo màu hổ phách và không bao giờ trình bày vết cũ như thể nó thuộc về mã mới chỉnh sửa.
- Bổ sung bộ kiểm thử UI Vitest tự động (`CodeEditor.test.tsx`).

### Ưu tiên 1: Chuẩn hóa Ngữ Nghĩa Vết Thực Thi (Snapshot Semantics)
- Định nghĩa rõ chuẩn **Before-statement snapshot convention**: Dòng hiển thị là lệnh *sắp sửa được thực thi*, trạng thái bộ nhớ phản ánh chính xác trạng thái *ngay trước* khi thực thi câu lệnh.
- Sửa lỗi nghiêm trọng tại `tracer.py`: Khắc phục việc đưa địa chỉ vào `deleted_addresses` trước khi lệnh `delete` được thực thi. Địa chỉ chỉ được cam kết thu hồi ở bước kế tiếp sau khi lệnh deallocation đã hoàn tất.
- Sửa lỗi thứ tự import: Chuyển `import time` lên đầu tệp `tracer.py`.
- Bổ sung phân loại kết thúc thực thi: Phân biệt rõ giữa kết thúc bình thường (`normal`), sự cố lỗi bộ nhớ (`crashed`), vượt trần số bước (`truncated`), hoặc quá thời gian (`timeout`).

### Ưu tiên 2: Topo Con Trỏ Thực Sự (Pointer Topology)
- Khắc phục lỗi nối mũi tên giả mạo giữa các nút kề nhau trong `LinkedListCanvas.tsx`. Mũi tên `pNext` chỉ được vẽ khi địa chỉ `pNext` của nút trùng khớp chính xác với nút đích.
- Phân chia canvas trực quan thành 4 khu vực riêng biệt:
  1. **Chuỗi Danh Sách Chính (Main Chain):** Các nút bắt đầu từ `pHead` liên kết tuần tự tới `nullptr`.
  2. **Các Nút Tách Rời (Detached Nodes):** Nút bị tháo khỏi chuỗi chính nhưng vẫn được giữ bởi con trỏ trên stack (ví dụ `temp`), không bị coi nhầm là rò rỉ bộ nhớ.
  3. **Các Nút Bị Cô Lập (Unreachable Nodes):** Ô nhớ không còn con trỏ nào quản lý, đánh dấu cảnh báo nguy cơ rò rỉ (Memory Leak).
  4. **Các Vùng Nhớ Đã Thu Hồi (Freed Memory):** Ô nhớ đã gọi `delete`, gạch ngang dữ liệu và cảnh báo con trỏ lơ lửng nếu còn tham chiếu tới.
- Phân loại trạng thái con trỏ chính xác: `valid`, `null`, `freed`, `dangling`, `uninitialized`, `unknown`.
- Bảo toàn định danh nút qua bộ đếm thế hệ cấp phát (`generation`) khi vùng nhớ được tái sử dụng (Address Reuse).

### Ưu tiên 3: Mở Rộng Kiểm Thử Bất Biến Bộ Nhớ (Memory Invariant Testing)
- Giữ nguyên 12 ca kiểm thử cơ sở ban đầu (`TC-GOLDEN-01`, `TC-EDGE-01..08`, `TC-SEC-01..02`, `TC-STDIN-DIFF`).
- Bổ sung 7 bài kiểm thử đơn vị bộ chuẩn hóa (`normalizerUnitTests.js`).
- Bổ sung 12 bài kiểm tra bất biến bộ nhớ độc lập (`test_invariants.js`):
  1. `MI-01`: Kiểm tra chính xác `pHead` trước và sau khi xóa nút đầu.
  2. `MI-02`: Kiểm tra chính xác `pTail` và `pNext == nullptr` sau khi xóa nút cuối.
  3. `MI-03`: Kiểm tra chính xác liên kết `prev->pNext` trước và sau khi tách nút giữa.
  4. `MI-04`: Trạng thái bộ nhớ chính xác tuyệt đối trước `delete` (chưa freed) và sau `delete` (đã freed).
  5. `MI-05`: Hai con trỏ bí danh (alias) cùng trỏ vào một nút.
  6. `MI-06`: Con trỏ lơ lửng (dangling pointer) trỏ vào vùng nhớ đã delete.
  7. `MI-07`: Nút tách rời khỏi danh sách chính nhưng vẫn sống qua con trỏ khác.
  8. `MI-08`: Tái sử dụng địa chỉ bộ nhớ (Address Reuse) duy trì thế hệ `generation >= 2`.
  9. `MI-09`: Ngăn xếp nhiều khung lệnh và đệ quy (`SumList`).
  10. `MI-10`: Dừng an toàn khi vượt quá số bước tối đa (`truncated`).
  11. `MI-11`: Đầu vào stdin khác nhau trên cùng mã nguồn cho kết quả độc lập.
  12. `MI-12`: Kiểm thử giao diện CodeMirror, thanh thời gian và tính nhất quán UI.

### Ưu tiên 4: Bảo Mật Thực Thi
- Backend chỉ lắng nghe tại `127.0.0.1` (localhost only) theo mặc định.
- Giới hạn tải trọng: Body 1MB, mã nguồn 50,000 ký tự, stdin 20,000 ký tự.
- Giới hạn đồng thời (Concurrency Control): Tối đa 2 tiến trình thực thi đồng thời để tránh làm cạn kiệt tài nguyên máy chủ.
- Hủy bỏ cây tiến trình (`taskkill /T /F` trên Windows) khi quá hạn thực thi.
- Tài liệu hóa trung thực: Runner hiện tại là môi trường cục bộ phục vụ học tập, không được tuyên bố là sandbox an toàn cho production. Thiết kế kiến trúc cô lập bằng microVM/container không mount docker socket cho phiên bản trực tuyến tương lai.

### Ưu tiên 5: Giao Diện Sư Phạm Thuần Việt
- Bản địa hóa 100% các nhãn UI và thông điệp hệ thống.
- Chuyển đổi mức độ khó bài học thành `[Cơ bản]`, `[Trung bình]`, `[Nâng cao]`.
- Giữ nguyên thuật ngữ định danh C++ chuẩn (`pHead`, `pTail`, `pNext`, `nullptr`, `delete`).
- Thêm bộ test kiểm tra bản địa hóa (`localization.test.tsx`).

### Ưu tiên 6: Tính Đồng Bộ Của Hồ Sơ & CI
- Chuẩn hóa `docs/ARCHITECTURE.md` khớp hoàn toàn với mã nguồn thực tế (tích hợp CodeMirror 6, Zod schema validation, Before-statement semantics).
- Tích hợp GitHub Actions CI (`.github/workflows/ci.yml`) tự động hóa type checking, build và unit tests.

---

## 2. Hướng Dẫn Kiểm Thử & Chạy Nghiệm Thu

```bash
# 1. Chạy toàn bộ 31 bài kiểm thử tự động (Baseline + Unit + Memory Invariants)
npm test

# 2. Chạy bộ kiểm thử UI và Bản địa hóa (Vitest)
npm --prefix client test

# 3. Biên dịch kiểm tra toàn bộ Client và Server
npm run build

# 4. Khởi chạy ứng dụng Web để kiểm tra trực tiếp
npm run dev
```

Địa chỉ truy cập Web: [http://localhost:5173](http://localhost:5173) hoặc [http://localhost:4000](http://localhost:4000)

---

## 3. Khuyến Nghị Kiểm Toán Cuối Cùng

- **Khuyến nghị:** **GO (CHẤP THUẬN NGHIỆM THU P0)**.
- **Lý do:** Toàn bộ các tiêu chí thành công đã được đáp ứng: người học có thể paste mã C++ tùy ý, cung cấp stdin, thực thi, bước tiến/lùi trên timeline và quan sát sơ đồ bộ nhớ/con trỏ không bao giờ mâu thuẫn với trạng thái thực thi thực tế.
