# DSA FlowLab P0 — Checklist kiểm toán PR #1

Code/regression đã kiểm chứng: [029520f35ed71b3b93cf2ed0f67aaadf477a15b1](https://github.com/Phuchello/DSA/commit/029520f35ed71b3b93cf2ed0f67aaadf477a15b1).  
PR: [#1](https://github.com/Phuchello/DSA/pull/1), đang mở, chưa merge.  
PR CI mới nhất: [run 39617710282](https://github.com/Phuchello/DSA/actions/runs/39617710282) trên đúng SHA; Linux job 119282888865 và Windows/native/Chrome job 119283457152 PASS.

## Verification

- [x] Linux/POSIX build và suite native: 74/74 unique assertions; process-tree riêng 4/4.
- [x] Windows MinGW g++/GDB build và suite native: 74/74 unique assertions; process-tree riêng 11/11.
- [x] Late child sau snapshot/root-only termination: child identity/heartbeat được xác nhận; runner báo unverified, không false-positive success.
- [x] Injected Process32NextW non-EOF error: snapshot incomplete báo unverified trước primary tool.
- [x] MI-18 tám timeout đồng thời, workspace cleanup và concurrency slot recovery PASS.
- [x] MI-19 stack/heap, MI-20 frame identity, MI-21 crash/partial trace, Golden trace, UI/localization và stdout chronology PASS.
- [x] Real Chrome 155.0.8059.40 với backend thật: paste/edit, stdin/stdout, timeline, topology/pointers, Beginner/Advanced tiếng Việt, pending-response stale protection và console PASS.
- [x] Browser evidence: [artifact 12353941958](https://github.com/Phuchello/DSA/actions/runs/39617710282/artifacts/12353941958); 255,809 bytes, SHA-256 cb6f126c2360b458628d5c7431af1e0bf6ce6a6dd3d928982db2cf3b6de4d567.

## Review và release boundary

- [x] Bằng chứng failing-before ở run 39614137541; corrective code và regression trên SHA 029520f35ed71b3b93cf2ed0f67aaadf477a15b1.
- [x] Latest PR Linux/Windows/Chrome matrix PASS trên SHA 029520f35ed71b3b93cf2ed0f67aaadf477a15b1.
- [ ] Independent reviewer kiểm tra lại; review threads vẫn unresolved.
- [ ] Human authorization để merge: **chưa có**.
- [ ] Merge, sửa main, tag, release, deploy/public runner: **không thực hiện**.

**Quyết định: GO cho independent review; NO-GO merge/release đến khi có review/authorization.** Native runner chạy với quyền host và không phải sandbox.
