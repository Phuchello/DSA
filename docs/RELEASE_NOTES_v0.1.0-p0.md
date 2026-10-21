# DSA FlowLab v0.1.0-p0 — Web P0

**Candidate:** [`9b36e90260449e99647516974abf0233d23b4a00`](https://github.com/Phuchello/DSA/commit/9b36e90260449e99647516974abf0233d23b4a00); PR review pending.  
**Trạng thái:** prerelease đề xuất; chưa tag, publish hoặc deploy.  
**Ngôn ngữ mặc định ứng dụng:** tiếng Việt. Package root/client/server: `0.1.0-p0`.

## Mục tiêu và chức năng

DSA FlowLab giúp sinh viên quan sát từng bước một số luồng C++ và cấu trúc dữ liệu trong trình duyệt. P0 tập trung vào những tình huống đã kiểm thử, đặc biệt là danh sách liên kết đơn; đây không phải debugger C++ phổ dụng.

- Chạy C++ thật qua g++/GDB, nhận stdin và tạo execution trace theo dòng nguồn.
- Hiển thị stack frame, biến, pointer, heap và topology `pHead`, `pTail`, `pNext`, pointer duyệt; theo dõi NODE allocation/deallocation trong các ca đã xác minh.
- Snapshot trước câu lệnh; stdout theo thời điểm tracer quan sát. Buffered output khi thoát hiển thị riêng.
- Timeline tiến/lùi; chế độ Tập sự và Chuyên sâu bằng tiếng Việt.
- Ownership trace bằng snapshot code/stdin và request ID; stale/out-of-order response bị bỏ.
- Giới hạn code/stdin, timeout và concurrency; Host header so khớp chính xác hostname local.

## Môi trường và khởi chạy local

README yêu cầu Node.js 18 trở lên; CI build trên Node.js 22. Cần g++ và GDB có Python scripting. Windows CI dùng MSYS2 MinGW-w64. Linux CI xác minh build/type-check/unit; native integration và real Chrome xác minh trong Windows job.

```bash
npm ci
npm --prefix server ci
npm --prefix client ci
npm run build
npm run dev
```

Mở `http://127.0.0.1:5173`. Backend mặc định bind loopback. Chỉ chạy source đáng tin cậy trên máy local.

## Kiểm chứng candidate

Run [39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020) trên candidate 9b36e90260449e99647516974abf0233d23b4a00: Linux PASS; Windows g++/GDB suite **54/54 unique assertions PASS**; real Chrome PASS. Browser log, structured evidence, trace và screenshots: [artifact 12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037). Phân tách số đếm và chi tiết ở [TEST_RESULTS.md](TEST_RESULTS.md).

## Hạn chế

Visualizer chỉ hỗ trợ một tập con trạng thái C++; không bảo đảm tương thích mọi chương trình/compiler/kiểu dữ liệu. Output bị buffer tới khi thoát không có timestamp câu lệnh chính xác. Browser test headless bao phủ một luồng golden linked-list, không phải mọi lesson/browser/device. Chrome version đi theo runner image, không pin cố định.

## Cảnh báo native runner

Runner thực thi C++ trên host với quyền của tiến trình hiện tại. Denylist, CORS, Host validation, limits, timeout và localhost mặc định **không phải sandbox**. Không dùng cho mã không tin cậy, không mở API runner ra Internet/multi-tenant, không phân phối binary native runner.

## P1 — công việc tương lai, chưa thuộc release này

Cô lập OS/microVM; mở rộng tập con C++ và compiler coverage; mở rộng ma trận browser/thiết bị và visual review; nghiên cứu định vị stdout chặt hơn khi có buffering.
