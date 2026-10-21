# DSA FlowLab: Web-first C++ Execution Visualizer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Web / Windows / Linux](https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20%7C%20Linux-green.svg)]()

**DSA FlowLab** là công cụ trực quan hóa từng bước thực thi mã nguồn C++ thời gian thực (C++ Execution Visualizer) trên nền tảng Web, được tối ưu đặc thù cho sinh viên đại học học Cấu trúc Dữ liệu & Giải thuật (môn IT003).

Sản phẩm cung cấp khả năng biên dịch C++ thực tế, nạp dữ liệu đầu vào `stdin`, theo dõi từng dòng thực thi mã, trực quan hóa ngăn xếp (Stack), vùng nhớ heap (Heap) với sơ đồ liên kết trực quan (Singly Linked List Diagram), cùng giao diện sư phạm song ngữ Việt - Anh.

---

## 🌟 Tính năng chính (P0 Milestone)

1. **Biên dịch & Thực thi C++ thật (Real C++ Execution Engine):**
   - Biên dịch bằng `g++` với đầy đủ debug symbols (`-g3 -O0`).
   - Engine tracing chính xác từng frame, biến cục bộ, con trỏ và heap qua bộ phân tích bộ nhớ.
   - Hỗ trợ đầy đủ dữ liệu nhập `stdin` (`std::cin`).

2. **Trực quan hóa cấu trúc Danh sách liên kết đơn (Singly Linked List):**
   - Tự động nhận diện cấu trúc `LIST` (`pHead`, `pTail`) và `NODE` (`info`, `pNext`).
   - Hiển thị địa chỉ bộ nhớ thật dạng hex (`0x...`).
   - Đánh dấu trạng thái con trỏ: hợp lệ, rỗng (`nullptr`), vùng nhớ đã giải phóng (`freed`), hoặc con trỏ lơ lửng (`dangling`).
   - Mũi tên liên kết động cập nhật chính xác theo từng bước `next`.

3. **Bài học mẫu Vàng (Golden Lesson IT003 - `TimKiemVaXoa`):**
   - Toàn bộ 8 ca biên (edge cases) của bài toán Tìm kiếm và Xóa nút trong DSLK đơn.
   - Minh họa xóa nút đầu, xóa nút cuối, xóa nút giữa, xóa nút lặp liên tiếp, danh sách rỗng, danh sách 1 phần tử.

4. **Giao diện sư phạm Tiếng Việt (Beginner & Advanced Mode):**
   - Chế độ **Tập sự (Beginner)**: Giải thích chi tiết sự thay đổi của bộ nhớ bằng ngôn ngữ tiếng Việt dễ hiểu.
   - Chế độ **Chuyên sâu (Advanced)**: Hiển thị đầy đủ địa chỉ bộ nhớ thô, khung stack, bảng biến và console.
   - Bảng điều khiển dòng thời gian (Timeline Slider, Step Forward / Step Backward, Reset, Jump to End).

---

## 🏗 Kiến trúc hệ thống

```text
[ Browser Frontend (React 18 + Vite + Tailwind + Lucide) ]
                       |
               HTTP POST /api/run { code, stdin }
                       |
                       v
[ Node.js / Express Orchestrator + Security Sandbox ]
                       |
                       v
[ Real C++ Execution Engine (g++ + Native Debug Tracing Engine) ]
                       |
          Structured Execution Trace (JSON)
                       |
                       v
[ DSA State Normalizer & Educational Semantic Engine ]
                       |
                       v
[ Interactive Visualizer: Stack, Heap Graph, Linked List, Vietnamese Tutor ]
```

---

## 🚀 Hướng dẫn cài đặt & Chạy ứng dụng

### Yêu cầu hệ thống:
- **Node.js**: v18.0.0 trở lên (khuyến nghị v20+)
- **g++**: Hỗ trợ C++11 trở lên (ví dụ: MinGW-w64 trên Windows hoặc gcc/g++ trên Linux/macOS)
- **gdb**: Hỗ trợ Python scripting (đi kèm với MinGW-w64 hoặc Linux gcc)

### Cài đặt:
```bash
# Cài đặt dependencies cho Backend và Frontend
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### Khởi chạy:
```bash
# Khởi chạy đồng thời cả Server (Port 4000) và Client (Port 5173)
npm run dev
```

Truy cập trình duyệt tại địa chỉ: **`http://localhost:5173`**

---

## 🧪 Kiểm thử (Testing)

```bash
# Chạy toàn bộ test suites (Golden test & Edge cases)
npm test
```

Xem chi tiết kết quả kiểm nghiệm tại [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md).

---

## 📄 Tài liệu độc lập (Audit Documents)

- [Kiến trúc kỹ thuật](docs/ARCHITECTURE.md)
- [Trạng thái triển khai](docs/IMPLEMENTATION_STATUS.md)
- [Biên bản kiểm thử thực tế](docs/TEST_RESULTS.md)
- [Vấn đề tồn đọng & Giới hạn](docs/KNOWN_ISSUES.md)
- [Bàn giao kiểm toán độc lập](docs/AUDIT_HANDOFF.md)

---

## 📜 Bản quyền & Giấy phép (Licenses)

- Dự án DSA FlowLab được phát hành dưới giấy phép [MIT](LICENSE).
- Tham chiếu kiến trúc và giấy phép liên quan:
  - [See++](https://github.com/knazir/SeePlusPlus) (MIT License, Copyright (c) 2024-2026 See++ Authors).
  - Giao diện và mã nguồn độc lập được thiết kế cho chương trình IT003.

## Release P0 đã chuẩn bị

- [Changelog](CHANGELOG.md)
- [Ghi chú phát hành v0.1.0-p0](docs/RELEASE_NOTES_v0.1.0-p0.md)
- [Checklist phát hành](docs/RELEASE_CHECKLIST.md)
- [Ghi chú bảo mật](docs/SECURITY_RELEASE_NOTES.md)
- [Manifest phát hành đề xuất](docs/RELEASE_MANIFEST_v0.1.0-p0.md)

Phiên bản đang ở trạng thái đề xuất; chưa tạo tag, chưa phát hành và chưa triển khai công khai.
