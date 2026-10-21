# Changelog

## v0.1.0-p0 — Candidate đã xác minh, chưa phát hành

- Trình trực quan hóa từng bước cho các ví dụ C++ đã kiểm thử, gồm stack/heap/pointer và topology danh sách liên kết đơn.
- Snapshot trước câu lệnh; stdout buffered nằm riêng ở output cuối.
- UI tiếng Việt, CodeMirror, stdin, timeline, chế độ Tập sự/Chuyên sâu.
- Trace ownership bằng snapshot code/stdin và request ID.
- Host header được so khớp chính xác với hostname local; localhost lookalike bị từ chối.
- Version package root/client/server và lockfiles đồng bộ `0.1.0-p0`.
- PR #1 review remediation code candidate 46181df225f664049ed9e179afc968fca111c898 PASS: Linux/POSIX and Windows MinGW/GDB each report 69 unique automated assertions; Windows real Chrome 155.0.8059.85 smoke PASS against the real backend. [Run 39588187541](https://github.com/Phuchello/DSA/actions/runs/39588187541); [browser artifact 12340063249](https://github.com/Phuchello/DSA/actions/runs/39588187541/artifacts/12340063249).

Release vẫn cần human review, merge approval, tag approval và publish approval. Chưa tạo tag/GitHub Release.
