# DSA FlowLab — Kết quả kiểm thử PR #1

Cập nhật: 21/10/2026  
Code candidate đã kiểm thử: [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed) trên `dev/flowlab-p0`.  
PR: [#1](https://github.com/Phuchello/DSA/pull/1) — đang mở, chưa merge.  
CI: [PR run 39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961) — Linux và Windows/native/Chrome đều PASS trên cùng code SHA.  
Jobs: [Linux 119245616617](https://github.com/Phuchello/DSA/actions/runs/39606982961/job/119245616617), [Windows + Chrome 119246143017](https://github.com/Phuchello/DSA/actions/runs/39606982961/job/119246143017).  
Browser artifact: [12348299743](https://github.com/Phuchello/DSA/actions/runs/39606982961/artifacts/12348299743), 255,489 bytes, SHA-256 `0048a878be7b7abe5c4d3ba4f0ef2c21439d55e789c2cfd70dcd75296180d427`, hết hạn 04/11/2026 13:24:07 UTC.

## Automated CI evidence

- Linux/POSIX: build, 25 frontend Vitest assertions, 11 normalizer tests và full native suite PASS. Native suite: 17/17 baseline + 11/11 normalizer + 21/21 memory invariants + 25 client assertions qua MI-12 = **74/74 unique assertions**.
- Windows: MinGW g++/GDB, build và full native suite PASS, **74/74 unique assertions**. Process-tree fallback và explicitly-unverified cleanup paths đều chạy trong job; MI-18 timeout, tree cleanup, temp workspace cleanup và concurrency recovery PASS.
- MI-19 stack-vs-heap, MI-20 recursive frame pointers, MI-21 native crash/partial trace, MI-22 independent LIST roots, MI-23 allocator evidence PASS.
- TC-GOLDEN-01, stdout chronology, MI-09, MI-14, abnormal termination và UI stale-request tests PASS.
- Focused Windows process-tree test chạy trực tiếp trên máy kiểm tra: **9/9 assertions**. Local client suite: **25/25**; normalizer suite: **11/11**; server/client production build PASS.

## Real-browser verification

Job Windows chạy Chrome thật **155.0.8059.40** với ứng dụng local và backend C++/GDB thật; API không bị mock. Log của job ghi nhận PASS cho:

- Vietnamese default UI và Beginner mode.
- Dán/sửa mã C++ trong CodeMirror, đổi stdin, thực thi thật và stdout mong đợi `0 8`.
- Điều hướng timeline tiến/lùi.
- Topology linked list và các pointer `L.pHead`, `L.pTail`, `k`, `L`, `p`.
- Advanced mode và memory inspector; quay lại Beginner tiếng Việt.
- Sửa stdin khi request thật đang chờ: trace cũ được đánh dấu stale, response cũ bị bỏ qua, chạy lại với input hiện tại thay trace đúng.
- Không có lỗi runtime hoặc exception ở browser console.

Artifact giữ browser logs, JSON response/trace và screenshots. Đây là evidence tự động từ một headless Chrome flow, không thay cho kiểm thử trực quan rộng hơn.

## Kết luận kiểm toán

Bốn finding của review đã có fix và regression evidence ở code candidate trên. CI của code candidate xanh trên Linux và Windows/Chrome. Các review threads vẫn để mở cho reviewer quyết định. **Khuyến nghị: NO-GO merge đến khi reviewer kiểm tra lại và có human authorization.**

Không merge, không sửa `main`, không tạo tag/release, không deploy và không công khai runner. Native runner dùng quyền của host và không phải sandbox; chỉ chạy code tin cậy local.
