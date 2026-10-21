# DSA FlowLab — Kết quả kiểm thử PR #1

Cập nhật: 21/10/2026. Code và regression được xác minh: [75cac8f](https://github.com/Phuchello/DSA/commit/75cac8f64442c6230a4dc90624ef5585e8779273) trên dev/flowlab-p0. PR [#1](https://github.com/Phuchello/DSA/pull/1) đang mở, chưa merge.

## Tái hiện lỗi trước khi sửa

Commit regression-only [0333e4c](https://github.com/Phuchello/DSA/commit/0333e4c41c7ef3ec9d0daa9517157632842b2b88}) thêm đồng bộ liên tiến trình để: hoàn tất snapshot ban đầu, tạo child mới, rồi dùng primary tool chỉ kết thúc root. Windows run [39614137541](https://github.com/Phuchello/DSA/actions/runs/39614137541), job [119271145305](https://github.com/Phuchello/DSA/actions/runs/39614137541/job/119271145305) thất bại đúng tại regression: child PID 6116, identity creation-time 134370655205316505 vẫn sống và heartbeat tiếp tục, nhưng runner chỉ trả lỗi timeout thông thường, không phát processTreeTerminationVerified=false. Đây là false-positive cleanup mà regression chặn.

## Kiểm chứng tự động mới nhất

PR CI [run 39620598658](https://github.com/Phuchello/DSA/actions/runs/39620598658) chạy trên đúng SHA 75cac8f64442c6230a4dc90624ef5585e8779273; cả hai job PASS:

- Linux/POSIX [job 119292682880](https://github.com/Phuchello/DSA/actions/runs/39620598658/job/119292682880): 74/74 unique assertions PASS; process-tree suite riêng 4/4.
- Windows/MinGW g++/GDB/Chrome [job 119293223762](https://github.com/Phuchello/DSA/actions/runs/39620598658/job/119293223762): 74/74 unique assertions PASS; process-tree suite riêng 11/11.
- Push CI độc lập [run 39620589502](https://github.com/Phuchello/DSA/actions/runs/39620589502) cũng PASS trên cùng SHA: Linux [job 119292654222](https://github.com/Phuchello/DSA/actions/runs/39620589502/job/119292654222), Windows/native/Chrome [job 119293217305](https://github.com/Phuchello/DSA/actions/runs/39620589502/job/119293217305).
- Golden trace, MI-18 timeout/cleanup/concurrency recovery, MI-19 stack/heap, MI-20 frame pointers, MI-21 crash, UI/localization tests và stdout chronology đều PASS.

Log Windows trên SHA này xác nhận:

- Late child sau snapshot: PID 3644, creation identity 134370670073705050; child sống qua lần root-only termination và helper trả unverified cleanup, không xác nhận sai rằng cây đã sạch. Harness kiểm tra heartbeat rồi dọn child.
- Injected Process32NextW error khác ERROR_NO_MORE_FILES: snapshot không hoàn chỉnh được báo unverified trước khi gọi primary taskkill.
- Process-tree assertions: 11/11; MI-18 chạy tám timeout đồng thời, dọn workspace và phục hồi slot thành công.

### Lịch sử run trung gian

Không che giấu các lần CI đỏ trong quá trình sửa:

- PR run [39615069050](https://github.com/Phuchello/DSA/actions/runs/39615069050) trên SHA 2b10986 trượt MI-18 khi một số helper bị kill ở giới hạn ngoài 12 giây. Commit [2097253](https://github.com/Phuchello/DSA/commit/209725315ee23993f6bc814c1de491dcf86dab85) giảm thời gian chờ primary/fallback; latest PR run ở trên PASS.
- PR run [39617257621](https://github.com/Phuchello/DSA/actions/runs/39617257621) trên SHA 20972531 từng vượt phép đo 15 giây của regression process-tree khởi động đầu tiên; push run cùng SHA [39617249991](https://github.com/Phuchello/DSA/actions/runs/39617249991) PASS. Không nới phép đo. Latest PR run trên SHA 75cac8f64442c6230a4dc90624ef5585e8779273 PASS với bộ đếm 11/11 và guard lỗi nếu số assertion không khớp.
- SHA bf56c22 từng in nhầm 11/12 dù các assertion đều qua; tổng đúng là 11. SHA 75cac8f64442c6230a4dc90624ef5585e8779273 sửa tổng và bắt CI thất bại nếu bộ đếm lệch.

## Prewarm và hành vi process-tree

Windows server biên dịch/cache native verifier trước khi bind localhost; process-tree regression suite cũng await prewarm trước phép đo timeout. Giới hạn đo 15 giây được giữ nguyên. Nếu prewarm khi khởi động thất bại, server ghi cảnh báo rồi vẫn bind localhost; cleanup vẫn fail-closed, không giả định cây process đã dừng.

## Hành vi và thay đổi process-tree

- [windowsProcessTree.ps1](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/server/src/runner/windowsProcessTree.ps1#L87-L103) chỉ coi ERROR_NO_MORE_FILES là kết thúc snapshot; lỗi khác ném diagnostic exception và handle luôn đóng trong finally.
- Get-CurrentTree ở [windowsProcessTree.ps1](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/server/src/runner/windowsProcessTree.ps1#L178-L226) giữ PID cùng creation identity lịch sử. Nếu tổ tiên đã thoát/PID có thể được tái sử dụng, descendants được đánh dấu không xác nhận; không terminate theo PID phỏng đoán. Helper trả unverified nếu child như vậy vẫn quan sát được.
- Primary taskkill tối đa 1.5 giây, chờ kết thúc taskkill tối đa thêm 0.5 giây; native verifier có deadline 3 giây. Chỉ fallback kill process được xác nhận bằng creation identity. [CppRunner](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/server/src/runner/cppRunner.ts#L171) áp dụng giới hạn ngoài cho helper và giữ workspace/slot nếu cleanup chưa xác minh.
- Regression đồng bộ và injected API failure ở [processTreeTests.js](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/tests/processTreeTests.js#L145-L255), fixture tạo late child độc lập stdio ở [processTreeChild.js](https://github.com/Phuchello/DSA/blob/75cac8f64442c6230a4dc90624ef5585e8779273/tests/processTreeChild.js#L31-L51).

## Real-browser verification

Job Windows dùng Chrome thật 155.0.8059.40 và backend C++/GDB thật (không mock API). Log xác nhận PASS cho:

- Mặc định tiếng Việt và Beginner.
- Dán/sửa C++, đổi stdin, chạy backend thật; stdout 0 8.
- Timeline tiến/lùi, topology linked list và pointer L.pHead, L.pTail, k, L, p.
- Chuyển Advanced, kiểm tra memory inspector, quay lại Beginner tiếng Việt.
- Sửa stdin khi request thật đang chờ: trace cũ bị giữ stale, response cũ với stdout 7 bị bỏ qua, chạy lại với input mới hiển thị stdout 8.
- Không có lỗi runtime/exception trong browser console.

Artifact browser [12355660470](https://github.com/Phuchello/DSA/actions/runs/39620598658/artifacts/12355660470) gồm 10 log/trace/ảnh, 255,766 bytes, SHA-256 857b9d4aceb20b2e50f9362cf1915bbdab1addcb89efb366881f123ec6fa4d8c, hết hạn 04/11/2026 14:57:09 UTC.

## Kết luận

**GO cho một vòng independent review mới; NO-GO merge cho đến khi reviewer xác nhận và có human authorization.** Các thread vẫn unresolved.

Giới hạn quan trọng: Windows Toolhelp snapshot không phải ownership boundary nguyên tử. Một descendant chưa xuất hiện ở lần snapshot cuối có thể lọt qua; Job Object chưa được tích hợp bằng suspended/atomic process launch. Với ancestry không chắc chắn, runner báo unverified và giữ workspace/execution slot; thao tác này an toàn theo hướng fail-closed nhưng có thể cần operator khởi động lại server và xử lý process/workspace còn lại. Không coi process-tree cleanup là sandbox.

Không sửa main, không merge, không tạo tag/release, không deploy; native runner vẫn chỉ dùng local với code tin cậy.
