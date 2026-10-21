# DSA FlowLab P0 — Checklist kiểm toán PR #1

Code/regression đã kiểm chứng: [75cac8f64442c6230a4dc90624ef5585e8779273](https://github.com/Phuchello/DSA/commit/75cac8f64442c6230a4dc90624ef5585e8779273).  
PR: [#1](https://github.com/Phuchello/DSA/pull/1), đang mở, chưa merge.  
PR CI mới nhất: [run 39620598658](https://github.com/Phuchello/DSA/actions/runs/39620598658) trên đúng SHA; Linux job 119292682880 và Windows/native/Chrome job 119293223762 PASS.

## Verification

- [x] Linux/POSIX build và suite native: 74/74 unique assertions; process-tree riêng 4/4.
- [x] Windows MinGW g++/GDB build và suite native: 74/74 unique assertions; process-tree riêng 11/11.
- [x] Late child sau snapshot/root-only termination: child identity/heartbeat được xác nhận; runner báo unverified, không false-positive success.
- [x] Injected Process32NextW non-EOF error: snapshot incomplete báo unverified trước primary tool.
- [x] MI-18 tám timeout đồng thời, workspace cleanup và concurrency slot recovery PASS.
- [x] MI-19 stack/heap, MI-20 frame identity, MI-21 crash/partial trace, Golden trace, UI/localization và stdout chronology PASS.
- [x] Real Chrome 155.0.8059.40 với backend thật: paste/edit, stdin/stdout, timeline, topology/pointers, Beginner/Advanced tiếng Việt, pending-response stale protection và console PASS.
- [x] Browser evidence: [artifact 12355660470](https://github.com/Phuchello/DSA/actions/runs/39620598658/artifacts/12355660470); 255,766 bytes, SHA-256 857b9d4aceb20b2e50f9362cf1915bbdab1addcb89efb366881f123ec6fa4d8c.
- [x] Windows verifier prewarm completes before server bind and before timed lifecycle assertions; the 15-second regression budget remains unchanged.
- [x] Push CI [run 39620589502](https://github.com/Phuchello/DSA/actions/runs/39620589502) also passes on code SHA 75cac8f64442c6230a4dc90624ef5585e8779273.

## Review và release boundary

- [x] Bằng chứng failing-before ở run 39614137541; corrective code và regression trên SHA 75cac8f64442c6230a4dc90624ef5585e8779273.
- [x] Latest PR Linux/Windows/Chrome matrix PASS trên SHA 75cac8f64442c6230a4dc90624ef5585e8779273.
- [ ] Independent reviewer kiểm tra lại; review threads vẫn unresolved.
- [ ] Human authorization để merge: **chưa có**.
- [ ] Merge, sửa main, tag, release, deploy/public runner: **không thực hiện**.

**Quyết định: GO cho independent review; NO-GO merge/release đến khi có review/authorization.** Native runner chạy với quyền host và không phải sandbox.
