# DSA FlowLab: Hạn chế kỹ thuật đã biết

Cập nhật: 21/10/2026  
Code candidate: [46181df225f664049ed9e179afc968fca111c898](https://github.com/Phuchello/DSA/commit/46181df225f664049ed9e179afc968fca111c898)  
CI: [run 39588187541](https://github.com/Phuchello/DSA/actions/runs/39588187541) PASS cả Linux và Windows/Chrome.  
Browser artifact: [12340063249](https://github.com/Phuchello/DSA/actions/runs/39588187541/artifacts/12340063249), retention đến 04/11/2026 10:59:21 UTC.

## 1. Cô lập mã C++
Runner gọi g++/GDB trên host với quyền tài khoản hiện tại. Static filter, size/time/concurrency limits, CORS, Host validation, process-tree termination và loopback mặc định không tạo sandbox. Chỉ chạy code tin cậy local; không public/multi-tenant trước khi OS/microVM isolation được đánh giá.

## 2. Thời điểm stdout bị buffer
Stdout giữ tại snapshot khi tracer quan sát. Nếu buffer chỉ flush lúc thoát, tracer không quy byte đó cho câu lệnh; output được hiển thị riêng với nhãn cuối. TC-STDOUT-CHRONOLOGY PASS run 39588187541.

## 3. Trace và trạng thái con trỏ
Trace thuộc về code/stdin snapshot và request ID. Input đổi thì trace cũ stale và response cũ không thay trace hiện tại. Crash/truncation giữ partial trace và termination status/reason. Pointer identity theo frame phân biệt cùng tên trong recursion. Heap NODE chỉ phân loại khi có allocation evidence; thiếu evidence thì unknown. Normalizer, MI-17, MI-19–21 và MI-12 pass run 39588187541.

## 4. Hành vi toolchain
Số bước có thể khác theo compiler/GDB/OS. Golden trace báo 162 snapshots Linux và 161 Windows, trong khi các event/allocation/invariant quan trọng được kiểm chứng trên cả hai. Contract là semantics/topology đã test, không phải trace byte-identical trên mọi toolchain.

## 5. Browser smoke scope
Real Chrome evidence [artifact 12340063249](https://github.com/Phuchello/DSA/actions/runs/39588187541/artifacts/12340063249) đến từ headless Chrome 155.0.8059.85 trên Windows CI với app/backend thật. Artifact giữ logs, JSON, response trace và screenshots. Coverage gồm golden linked-list flow, pointer topology, timeline, Vietnamese modes và pending stdin-response race. Chưa bao phủ mọi browser/version/device/lesson, không thay visual review thật. Chrome version theo hosted runner image, không pin cố định.

## 6. Evidence retention
GitHub Actions artifact giữ 14 ngày; hết hạn thì cần chạy lại để tái tạo bằng chứng.
