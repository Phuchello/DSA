# Changelog

## v0.1.0-p0 — Candidate đã xác minh, chưa phát hành

- Trình trực quan hóa từng bước cho các ví dụ C++ đã kiểm thử, gồm stack/heap/pointer và topology danh sách liên kết đơn.
- Snapshot trước câu lệnh; stdout buffered nằm riêng ở output cuối.
- UI tiếng Việt, CodeMirror, stdin, timeline, chế độ Tập sự/Chuyên sâu.
- Trace ownership bằng snapshot code/stdin và request ID.
- Host header được so khớp chính xác với hostname local; localhost lookalike bị từ chối.
- Version package root/client/server và lockfiles đồng bộ `0.1.0-p0`.
- CI candidate 9b36e90260449e99647516974abf0233d23b4a00 PASS: Linux build/unit, Windows native C++/GDB 54/54 assertions và real Chrome smoke. [Run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020); [browser artifact 12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037).

Release vẫn cần human review, merge approval, tag approval và publish approval. Chưa tạo tag/GitHub Release.
