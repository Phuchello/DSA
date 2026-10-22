# DSA FlowLab — Giới hạn đã biết

Source/test SHA mới nhất: [159d5a9ddd65cd4c459a3a33d8a9364366090ae0](https://github.com/Phuchello/DSA/commit/159d5a9ddd65cd4c459a3a33d8a9364366090ae0). PR matrix [run 39629546638, attempt 2](https://github.com/Phuchello/DSA/actions/runs/39629546638) PASS; Linux [job 119580238268](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119580238268), Windows/native/Chrome [job 119580237225](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119580237225). Browser evidence [artifact 12393674663](https://github.com/Phuchello/DSA/actions/runs/39629546638/artifacts/12393674663), 255,732 bytes, SHA-256 `b3abed9fe0bc0d611476a3d2703f16d6a11cae2c0022af7fe5e5cd791d7c234b`.

## P/Invoke fault-injection evidence

Original `SetLastErrorNative` binding reproduced `EntryPointNotFoundException`: kernel32 exports `SetLastError`, not `SetLastErrorNative`. Correct binding captured native code 5. Test now proves injection reached, both observed codes equal 5, exception chain contains `Win32Exception.NativeErrorCode=5`, no binding/DLL failure, no primary taskkill, bounded settlement and fixture cleanup. Latest Windows log shows 18/18 pre-cleanup checks and 19/19 including cleanup; full Windows suite is 74/74 unique assertions and process-tree 11/11.

**Intermittent contention limitation:** CI attempt 1 in PR [Windows job 119324367670](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119324367670) and push [Windows job 119324625939](https://github.com/Phuchello/DSA/actions/runs/39629540435/job/119324625939) ran the same source/test SHA concurrently. During MI-18's eight simultaneous timeouts, the Node 12-second outer bound killed PowerShell tree-verifier helpers (`signal=SIGTERM, killed=true`); results were labeled interrupted and hosted-runner cleanup reported orphan GDB processes. The same PR run's attempt 2, with no source or assertion changes, passed MI-18 and the full native/browser suite. The helper remains fail-closed, but termination under high host contention can exceed its outer bound and leave a child process requiring runner/operator cleanup. This is not resolved by the P/Invoke test fix; retain local-only trusted-source restrictions and do not claim atomic process ownership.


## Process ownership trên Windows

- Toolhelp snapshot + process creation-time identity phát hiện race đã tái hiện. Khi root đã thoát, late descendant có thể được nhận diện qua PID tổ tiên lịch sử nhưng ancestry được coi là không chắc chắn; runner báo cleanup unverified và không kill theo PID phỏng đoán để tránh giết process không liên quan sau PID reuse.
- Snapshot polling không phải ownership boundary nguyên tử. Descendant có thể được tạo/quan sát ngay sau lần snapshot cuối; helper không thể bảo đảm không có orphan trong mọi interleaving. Job Object với JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE chưa được thêm vì launcher hiện chưa tạo process suspended rồi assign atomically trước khi code có thể spawn child.
- Khi shutdown unverified, [cppRunner.ts](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/server/src/runner/cppRunner.ts#L480-L481) giữ execution slot và temp workspace để tránh xóa tài nguyên/process đang dùng. Server có thể cần operator restart; trước khi dọn workspace thủ công phải xác minh child đã dừng.
- Các PR attempt trung gian [39617257621](https://github.com/Phuchello/DSA/actions/runs/39617257621) từng vượt phép đo 15 giây khi helper compile lạnh. Fix hiện tại prewarm verifier trước khi server bind và trước phép đo; assertion 15 giây không bị nới. PR run [39620598658](https://github.com/Phuchello/DSA/actions/runs/39620598658) và push run [39620589502](https://github.com/Phuchello/DSA/actions/runs/39620589502) đều PASS trên code SHA 75cac8f64442c6230a4dc90624ef5585e8779273; PR run [39621877776](https://github.com/Phuchello/DSA/actions/runs/39621877776) cũng PASS sau docs-only update. Nếu prewarm khởi động thất bại, server cảnh báo và cleanup vẫn fail-closed.

## An toàn thực thi

Backend chạy g++/GDB với quyền của tài khoản host. Static filters, size/time/concurrency limits, CORS/Host checks, loopback mặc định và process-tree cleanup **không phải sandbox**. Chỉ chạy code tin cậy local. Không public hoặc multi-tenant trước khi có OS-level isolation/microVM. CI evidence không thay đổi hạn chế này.

## Phạm vi trace, browser và build

Visualizer theo dõi tập con C++ đã kiểm thử; không phải debugger tổng quát. Semantics/topology là contract, không phải byte-identical trace giữa compiler/GDB/OS. Heap NODE chỉ xác nhận khi có evidence allocator từ GDB; thiếu evidence location/relationship có thể là unknown. Buffered stdout chỉ gắn bước khi quan sát được; output flush lúc thoát hiển thị riêng final output.

Browser smoke dùng headless Chrome 155.0.8059.40 trên Windows với backend thật; bao phủ golden linked-list flow và Vietnamese modes, không thay cho kiểm thử mọi browser/device/accessibility. Artifact CI hết hạn sau 14 ngày.

Build tạo JS chunk 725.13 kB chưa nén, vượt cảnh báo Vite 500 kB; build vẫn PASS. Code splitting không thuộc fix review này.
