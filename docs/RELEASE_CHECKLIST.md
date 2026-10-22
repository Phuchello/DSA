# DSA FlowLab P0 — Checklist kiểm toán PR #1

Source/test SHA mới nhất: [159d5a9ddd65cd4c459a3a33d8a9364366090ae0](https://github.com/Phuchello/DSA/commit/159d5a9ddd65cd4c459a3a33d8a9364366090ae0).  
PR: [#1](https://github.com/Phuchello/DSA/pull/1), đang mở, chưa merge.  
PR matrix [run 39629546638, attempt 2](https://github.com/Phuchello/DSA/actions/runs/39629546638) PASS; Linux [job 119580238268](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119580238268), Windows/native/Chrome [job 119580237225](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119580237225); evidence [artifact 12393674663](https://github.com/Phuchello/DSA/actions/runs/39629546638/artifacts/12393674663), SHA-256 `b3abed9fe0bc0d611476a3d2703f16d6a11cae2c0022af7fe5e5cd791d7c234b`.

## Windows P/Invoke regression

- [x] Tái hiện lỗi gốc trên Windows PowerShell/.NET: export `SetLastError` tồn tại, `SetLastErrorNative` không tồn tại; khai báo cũ ném `EntryPointNotFoundException`; binding đúng đọc code 5.
- [x] Sau sửa: phase `snapshot-enumeration`; nhánh injection được gọi; cả giá trị sau P/Invoke và snapshot đều là 5; `Win32Exception.NativeErrorCode=5`; không binding/DLL exception.
- [x] Fail-closed/unverified, taskkill chính không được gọi, Promise bounded, fixture cleanup xác nhận; 19/19 focused checks.
- [x] Process-tree suite Windows 11/11; full Windows unique assertions 74/74.

## Verification

- [x] Linux/POSIX build và suite native: 74/74 unique assertions; process-tree riêng 4/4.
- [x] Windows MinGW g++/GDB build và suite native: 74/74 unique assertions; process-tree riêng 11/11.
- [x] Late child sau snapshot/root-only termination: child identity/heartbeat được xác nhận; runner báo unverified, không false-positive success.
- [x] Injected Process32NextW error 5: 19/19 focused assertions, Win32Exception.NativeErrorCode=5, snapshot enumeration fail-closed trước primary taskkill.
- [x] MI-18 tám timeout đồng thời, workspace cleanup và concurrency slot recovery PASS.
- [x] MI-19 stack/heap, MI-20 frame identity, MI-21 crash/partial trace, Golden trace, UI/localization và stdout chronology PASS.
- [x] Real Chrome 155.0.8059.40 với backend thật: paste/edit, stdin/stdout, timeline, topology/pointers, Beginner/Advanced tiếng Việt, pending-response stale protection và console PASS.
- [x] Browser evidence latest source/test SHA: [artifact 12393674663](https://github.com/Phuchello/DSA/actions/runs/39629546638/artifacts/12393674663); 255,732 bytes, SHA-256 b3abed9fe0bc0d611476a3d2703f16d6a11cae2c0022af7fe5e5cd791d7c234b.
- [x] Windows verifier prewarm completes before server bind and before timed lifecycle assertions; the 15-second regression budget remains unchanged.
- [x] Browser smoke and artifact from the passing PR rerun verified on source/test SHA 159d5a9ddd65cd4c459a3a33d8a9364366090ae0; first concurrent push run failed MI-18 and is disclosed above and in KNOWN_ISSUES.md.

## Review và release boundary

- [x] Failing-before P/Invoke reproduction and corrective regression documented in TEST_RESULTS.md; code fix 04598d08f18fea2e0a47463e22ec7e9b4d4dc97f, source/test SHA 159d5a9ddd65cd4c459a3a33d8a9364366090ae0.
- [x] PR matrix trên latest source/test SHA 159d5a9ddd65cd4c459a3a33d8a9364366090ae0 PASS trong attempt 2. PR job [119324367670](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119324367670) và concurrent push job [119324625939](https://github.com/Phuchello/DSA/actions/runs/39629540435/job/119324625939) ở attempt 1 thất bại MI-18 dưới tải cao; limitation được ghi rõ trong KNOWN_ISSUES.md.
- [ ] Independent reviewer kiểm tra lại; review threads vẫn unresolved.
- [ ] Human authorization để merge: **chưa có**.
- [ ] Merge, sửa main, tag, release, deploy/public runner: **không thực hiện**.

**Quyết định: GO cho independent review; NO-GO merge/release đến khi có review/authorization.** Native runner chạy với quyền host và không phải sandbox.
