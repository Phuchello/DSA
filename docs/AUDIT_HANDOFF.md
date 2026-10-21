# DSA FlowLab — Bàn giao kiểm toán chất lượng P0

**Ngày:** 21/10/2026  
**Repository:** [Phuchello/DSA](https://github.com/Phuchello/DSA)  
**Nhánh:** `dev/flowlab-p0`  
**Candidate commit:** [`9b36e90260449e99647516974abf0233d23b4a00`](https://github.com/Phuchello/DSA/commit/9b36e90260449e99647516974abf0233d23b4a00)  
**CI:** [run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020) — Linux và Windows + real Chrome PASS.  
**Artifact:** [12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037) — log, JSON evidence, trace và ảnh chụp.

## Kết quả audit

So sánh `main...dev/flowlab-p0`: nhánh dev ahead 18 commits, behind 0; merge base là `b0478a027993516a2580b744f4d9685027ad6e77`. Diff bao gồm ứng dụng P0, tracer, normalizer, tests, CI và tài liệu. Main không thay đổi trong quá trình chuẩn bị.

- Tracer giữ semantics `before-statement`; không backfill stdout cuối vào snapshot trước. Output buffered khi thoát nằm riêng trong `finalStdout`.
- App gắn trace với snapshot code/stdin và request ID. Response cũ hoặc out-of-order không được đánh dấu hiện hành khi đầu vào đã đổi.
- CodeMirror, stdin, timeline hai chiều, topology `pHead`/`pTail`/`pNext`, pointer duyệt và mode tiếng Việt được xác minh bằng real Chrome trên backend C++/GDB thật.
- Bộ kiểm tra Host từng dùng prefix matching. Candidate đổi sang parse hostname và so khớp chính xác; regression kiểm tra localhost hợp lệ và hostname lookalike bị HTTP 403.
- CORS allowlist, loopback mặc định, giới hạn input, timeout và concurrency vẫn được giữ. Đây là các kiểm soát cấu hình/tài nguyên, không phải sandbox.
- Metadata package root/client/server và lockfiles thống nhất ở `0.1.0-p0`.

## Bằng chứng

- Linux: client build/type-check, 14 Vitest tests, server build, 8 normalizer tests — PASS.
- Windows: build, native C++/GDB, **54/54 unique assertions** — PASS; gồm 15 baseline, 8 normalizer, 17 memory invariants, 14 client assertions qua MI-12. MI-09, MI-14, golden trace và stdout chronology PASS.
- Real Chrome: edit/paste C++, stdin, stdout `0 8`, timeline, pointer topology, Beginner/Advanced tiếng Việt, pending response stdout `7` bị bỏ qua sau khi input đổi, rerun stdout `8`, browser console sạch — PASS.
- Artifact [12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037) được upload thành công, 252,886 bytes, retention 14 ngày.

Chi tiết test ở [TEST_RESULTS.md](TEST_RESULTS.md).

## Rủi ro và giới hạn

Runner chạy binary C++ bản địa bằng g++/GDB với quyền của tiến trình host. Static denylist, timeout, CORS, Host validation, size/concurrency limits và localhost binding không phải sandbox. Không mở runner công khai hoặc multi-tenant cho đến khi có cô lập OS/microVM được đánh giá. Coverage trace/browser hữu hạn như liệt kê trong TEST_RESULTS và KNOWN_ISSUES.

## Trạng thái phát hành

Đã chuẩn bị release docs và manifest đề xuất cho `v0.1.0-p0`; chưa có tag, GitHub Release hay deployment. PR hướng `dev/flowlab-p0` → `main` được tạo để con người review. **Không merge nếu chưa có human approval.**
