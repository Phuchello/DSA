# DSA FlowLab v0.1.0-p0 — Ghi chú candidate

**Candidate nội bộ trong PR #1, chưa phát hành.** Code được kiểm thử: [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed).

## Thay đổi trong remediation

- Dừng toàn bộ cây tiến trình có xác minh trên POSIX và Windows; xử lý timeout bounded, dọn workspace và khôi phục concurrency slot.
- Giữ identity con trỏ tách biệt theo stack frame, kể cả biến trùng tên trong recursion và `CreateNode`.
- Trả về trạng thái/kết quả bất thường cùng partial trace; crash/truncation không bị báo như hoàn tất thành công.
- Chỉ nhận dạng NODE heap khi GDB ghi nhận địa chỉ từ allocator; stack/địa chỉ thiếu evidence giữ location thích hợp hoặc `unknown`.
- Giữ nhiều LIST roots và hiển thị riêng quan hệ pointer trên canvas.
- Giao diện mặc định tiếng Việt.

## Verification

[CI run 39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961): Linux/POSIX và Windows native g++/GDB đều PASS 74/74 unique assertions. Real Chrome 155.0.8059.40 với backend thật PASS. Browser logs, trace/JSON và screenshots: [artifact 12348299743](https://github.com/Phuchello/DSA/actions/runs/39606982961/artifacts/12348299743). Chi tiết: [TEST_RESULTS.md](TEST_RESULTS.md).

## Giới hạn và trạng thái

Visualizer hỗ trợ tập con C++ đã kiểm thử; số lượng bước có thể khác theo toolchain. Browser smoke chỉ là một headless Chrome flow. Artifact hết hạn sau 14 ngày. Runner chạy với quyền host và không phải sandbox: chỉ code tin cậy local, không public/multi-tenant. PR chưa được merge; chưa tạo tag, GitHub Release hoặc deployment.
