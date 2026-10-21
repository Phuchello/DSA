# DSA FlowLab v0.1.0-p0 — Web P0

Candidate code: [46181df225f664049ed9e179afc968fca111c898](https://github.com/Phuchello/DSA/commit/46181df225f664049ed9e179afc968fca111c898); PR #1 review remediation verified.  
Trạng thái: prerelease đề xuất; chưa tag, publish hoặc deploy.  
Ngôn ngữ mặc định: tiếng Việt. Package root/client/server: 0.1.0-p0.

## Mục tiêu và chức năng
DSA FlowLab giúp sinh viên quan sát từng bước một số luồng C++ và cấu trúc dữ liệu trong trình duyệt. P0 tập trung vào tình huống đã kiểm thử, đặc biệt danh sách liên kết đơn; đây không phải debugger C++ phổ dụng.
- Chạy C++ thật qua g++/GDB, nhận stdin và tạo trace theo dòng nguồn.
- Hiển thị stack frame, biến, pointer, heap và linked-list topology trong trường hợp đã xác minh.
- Snapshot trước câu lệnh; stdout quan sát theo thời gian. Buffered output lúc thoát được gắn nhãn riêng.
- Timeline tiến/lùi; chế độ Tập sự và Chuyên sâu bằng tiếng Việt.
- Trace gắn với code/stdin snapshot và request ID; stale/out-of-order response không thay trace hiện tại.
- Giới hạn input, timeout, concurrency và loopback Host validation; không coi đây là sandbox.

## Bản sửa review P0
- POSIX process groups và Windows process-tree kill dọn cây thực thi, settle request, dọn workspace và khôi phục concurrency.
- Pointer instances được phân biệt theo stack frame trong recursion.
- Crash/truncation giữ termination status/reason và partial trace; không xuất hiện như thành công.
- Stack NODE không bị coi là heap chỉ vì đọc được; thiếu allocation evidence thì unknown.

## Kiểm chứng
[CI run 39588187541](https://github.com/Phuchello/DSA/actions/runs/39588187541) trên candidate: Linux/POSIX PASS; Windows native g++/GDB 69/69 unique assertions PASS; real Chrome 155.0.8059.85 PASS trên backend thật. Artifact logs/JSON/trace/screenshots: [12340063249](https://github.com/Phuchello/DSA/actions/runs/39588187541/artifacts/12340063249). Chi tiết ở [TEST_RESULTS.md](TEST_RESULTS.md).

## Hạn chế và an toàn
Visualizer hỗ trợ tập con C++; buffered stdout cuối không được gán ngược cho statement; browser test chỉ headless Chrome trên một golden flow, không bao phủ mọi browser/device/lesson. Native runner chạy với quyền host và không phải sandbox. Chỉ chạy code tin cậy local; không public/multi-tenant.

Chưa merge, bật auto-merge, tạo tag, GitHub Release hoặc deployment. Cần human review và approval riêng cho từng release action.
