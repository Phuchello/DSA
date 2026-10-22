# DSA FlowLab — Kết quả kiểm thử PR #1

Cập nhật: 22/10/2026. Source/test SHA đã kiểm chứng: [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2) trên `dev/flowlab-p0`. PR [#1](https://github.com/Phuchello/DSA/pull/1) vẫn mở, chưa merge.

## Final Windows process-ownership gate

### Root cause và lỗi trước sửa

Ở source/test SHA `159d5a9`, mỗi Windows timeout dùng PowerShell + Toolhelp để chụp cây process, chạy `taskkill`, rồi lặp snapshot/xác minh bằng PID và creation identity. Windows CI attempt đầu khi MI-18 chạy tám GDB timeout đồng thời ghi nhận helper bị Node.js outer bound 12 giây kết thúc (`signal=SIGTERM`, `killed=true`); một số request trở thành `interrupted`/unverified và runner cleanup thấy process `gdb`/`gdborig` còn lại. Xem PR job [119324367670](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119324367670) và push job [119324625939](https://github.com/Phuchello/DSA/actions/runs/39629540435/job/119324625939).

Các log lỗi cũ không lưu timestamp từng phase nên không đủ căn cứ kết luận riêng PowerShell startup, Toolhelp snapshot, taskkill hay CPU scheduling là nút thắt. Thực tế đã chứng minh là helper vượt deadline dưới tải, còn Toolhelp không sở hữu nguyên tử các descendant được tạo sau snapshot. Tăng deadline hoặc chỉ tối ưu polling không giải quyết ranh giới ownership.

### Tính hợp lệ của lỗi tiêm Process32NextW

Lỗi kiểm thử ban đầu đã được tái hiện trên Windows PowerShell/.NET: native export của Windows là `SetLastError`; tên managed `SetLastErrorNative` không phải export. Declaration cũ không đặt `EntryPoint`, nên runtime ném `EntryPointNotFoundException`. Regression cũ chỉ kiểm tra kết quả ngoài là “unverified”, vì vậy lỗi binding sai vẫn làm test xanh. Bằng chứng runtime/export và lịch sử sửa nằm tại [PR review discussion](https://github.com/Phuchello/DSA/pull/1#discussion_r4343663370) và diff của [commit 04598d0](https://github.com/Phuchello/DSA/commit/04598d08f18fea2e0a47463e22ec7e9b4d4dc97f).

Fix dùng `[DllImport("kernel32.dll", EntryPoint = "SetLastError", ExactSpelling = true, SetLastError = true)]`. Regression được củng cố tại [commit 159d5a9](https://github.com/Phuchello/DSA/commit/159d5a9ddd65cd4c459a3a33d8a9364366090ae0): test xác nhận fault branch đã được thử và tới được sau P/Invoke; injected và snapshot error đều bằng `ERROR_ACCESS_DENIED (5)`; exception chain có `Win32Exception.NativeErrorCode == 5`, đúng phase `snapshot-enumeration`, đúng message; không chứa `EntryPointNotFoundException`, `DllNotFoundException` hoặc wrapper PowerShell lạ; primary `taskkill` không chạy; Promise settle trong hard bound; fixture được dọn tường minh. Đây là test seam của verifier Toolhelp, không phải bypass cho đường thực thi sản phẩm.

Windows CI trên SHA này in rõ `18/18 pre-cleanup checks PASS` rồi `fixture cleanup: confirmed; 19/19 checks PASS`; regression suite tổng là `13/13`. Xem [PR Windows job 119647496134](https://github.com/Phuchello/DSA/actions/runs/39725121832/job/119647496134) và [push Windows job 119647526674](https://github.com/Phuchello/DSA/actions/runs/39725116557/job/119647526674). Log sau sửa xác nhận `phase=snapshot-enumeration`, `nativeErrorCode=5`, `Win32Exception confirmed`, `no P/Invoke binding error`. Bản sửa không chỉ dựa trên trạng thái unverified chung.

### Quyết định thiết kế

Đã chọn Windows Job Object thay vì cải thiện Toolhelp cho production. Launcher native tạo Job Object với `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, rồi gọi `CreateProcessW` với `STARTUPINFOEX` và `PROC_THREAD_ATTRIBUTE_JOB_LIST` để gắn target vào Job ngay trong lúc tạo process còn suspended. Chỉ sau khi xác nhận root identity và membership mới `ResumeThread`. Danh sách handle thừa kế được giới hạn vào stdin/stdout/stderr; Job handle không được truyền cho target. Descendant thông thường kế thừa membership; không đặt cờ breakaway.

Khi timeout, supervisor gọi `TerminateJobObject` và đợi `QueryInformationJobObject` cho đến khi active count bằng 0 trong tối đa 3.5 giây. Node chờ supervisor tối đa 6 giây. Nếu không có status cuối đã xác minh, Node kết thúc supervisor để kernel đóng Job handle; response vẫn là unverified/interrupted, workspace và execution slot được giữ lại. Không báo thành công chỉ vì Promise đã settle. Kết thúc bình thường cũng chỉ được chấp nhận khi Job báo 0 process.

`PROC_THREAD_ATTRIBUTE_JOB_LIST` được Microsoft hỗ trợ trên Windows 10+ và Windows Server 2016+; nested jobs có từ Windows 8/Server 2012, nhưng giới hạn của Job cha có thể khiến gắn Job con thất bại. Trên OS cũ hoặc môi trường nested-job không tương thích, launcher fail-closed trước khi chạy target. [Microsoft: UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute), [Microsoft: Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Đây là process ownership/cleanup, không phải sandbox. Các phép thử xác nhận trên GitHub-hosted Windows runner và máy phát triển hiện tại; chưa khẳng định mọi cấu hình Windows/Job cha. Mã C++ vẫn chỉ được chạy local với nguồn tin cậy.

### Root-exit/descendant race found and fixed

A Windows MI-18 run on source/test SHA `7ea641d` exposed a real completion race: the root process could exit while a short-lived descendant remained in the Job Object. The launcher immediately sampled the active count and rejected/terminated that execution instead of allowing the child to finish naturally. The push Windows job [39730307595](https://github.com/Phuchello/DSA/actions/runs/39730307595/job/119663949921) reproduced it; an independent PR run passed, so this timing-sensitive failure required a deterministic regression.

The regression fixture now has a child signal readiness, wait for the parent to exit, then stay alive for 250 ms. The production launcher drains naturally for at most 500 ms after root exit and checks the timeout event during that interval. A timeout still takes the existing `TerminateJobObject` path. If members remain after the drain bound, they are forcibly terminated and completion is not reported as normal. The test checks exact PID/creation identities and verified zero Job members.

On final source/test SHA [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2), the PR Windows log recorded a 265 ms drain and the push Windows log a 250 ms drain; in each, both recorded process identities exited and final status was verified:
[PR Windows job 119666657833](https://github.com/Phuchello/DSA/actions/runs/39731178032/job/119666657833) · [push Windows job 119666655469](https://github.com/Phuchello/DSA/actions/runs/39731173170/job/119666655469).

### Automated CI trên source/test SHA mới nhất

Source/test SHA [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2) đã được kiểm tra trên hai workflow độc lập; Linux và Windows/native/Chrome đều PASS:

- PR [run 39731178032](https://github.com/Phuchello/DSA/actions/runs/39731178032): Linux [job 119666335082](https://github.com/Phuchello/DSA/actions/runs/39731178032/job/119666335082), Windows/native/Chrome [job 119666657833](https://github.com/Phuchello/DSA/actions/runs/39731178032/job/119666657833).
- Push [run 39731173170](https://github.com/Phuchello/DSA/actions/runs/39731173170): Linux [job 119666320150](https://github.com/Phuchello/DSA/actions/runs/39731173170/job/119666320150), Windows/native/Chrome [job 119666655469](https://github.com/Phuchello/DSA/actions/runs/39731173170/job/119666655469).
- Mỗi OS: 17/17 baseline, 11/11 normalizer, 21/21 invariants, 25 client assertions; **74/74 unique assertions**.
- Mỗi Windows job: Process32NextW fault injection **18/18 trước cleanup, 19/19 gồm cleanup**; process-tree **13/13**; Job Object stress **202/202**, hai vòng với tám roots và 16 timeout executions; MI-18 chạy hai batch thật, mỗi batch tám timeout GDB đồng thời, sau đó xác minh process cleanup, workspace removal và slot recovery.
- Root-exit regression xác minh descendant ngắn hạn được drain tự nhiên (250 ms push, 265 ms PR), không bị nhầm thành timeout hay success trước khi active count về 0.
- Chi tiết từng lần chạy thất bại trong quá trình hardening và nguyên nhân đã tách riêng bên dưới; không lược bỏ chúng khỏi hồ sơ.

### Các lỗi CI trong quá trình hardening

Các lượt sau là bằng chứng cho những regression/harness defects đã phát hiện và sửa, không phải kết quả của head cuối:

- CI [39728385384](https://github.com/Phuchello/DSA/actions/runs/39728385384) dừng ở fixture metadata chờ quá hạn trước browser smoke; đây là lỗi readiness của fixture.
- CI [39729245592](https://github.com/Phuchello/DSA/actions/runs/39729245592) và [39729250557](https://github.com/Phuchello/DSA/actions/runs/39729250557) bắt được giả định sai rằng Windows descendant không có standard handles hợp lệ. CI [39729820174](https://github.com/Phuchello/DSA/actions/runs/39729820174) và [39729824962](https://github.com/Phuchello/DSA/actions/runs/39729824962) lặp lại lỗi assertion tương tự sau lần thử dùng NULL startup handles. Regression cuối so sánh handle identity do fixture tạo thay vì giả định handle mặc định không hợp lệ.
- CI [39730307595](https://github.com/Phuchello/DSA/actions/runs/39730307595) tái hiện root-exit/descendant race trong MI-18. Bản sửa có regression deterministic ở commit [e35ba3e](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2) và hai ma trận cuối đều pass.
- Lỗi lịch sử Toolhelp/PowerShell deadline trên MI-18 ở [PR job 119324367670](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119324367670) và [push job 119324625939](https://github.com/Phuchello/DSA/actions/runs/39629540435/job/119324625939) là trigger ban đầu để chuyển ownership sang Job Object. Log không có timestamp cho từng phase nên không quy lỗi cho một syscall cụ thể.

### Real-browser verification

Hai Windows CI jobs dùng Chrome thật `155.0.8059.85` cùng backend C++/GDB thật, không mock `/api/run`. Cả hai PASS:

- PR log ghi nhận paste/edit C++, stdin `3\n3 0 8\n3`, stdout `0 8`, timeline `0→1→0`, topology với `L.pHead`, `L.pTail`, `k`, `L`, `p`, Beginner/Advanced và UI tiếng Việt.
- Khi stdin cũ `1\n7\n3` đang pending rồi đổi thành `1\n8\n3`, trace vẫn stale; response thật stdout `7` bị bỏ qua. Rerun với input hiện tại trả stdout `8` và xóa stale warning.
- Browser console không có exception/error.
- PR artifact [12402437554](https://github.com/Phuchello/DSA/actions/runs/39725121832/artifacts/12402437554), 255,207 bytes, SHA-256 `175eec32bd788c502398f90e0622e097a5d46abfed70a8d91026c5b6404c61db`.
- Push artifact [12402987783](https://github.com/Phuchello/DSA/actions/runs/39725116557/artifacts/12402987783), 255,485 bytes, SHA-256 `af14e7df04b6649c0f98c6a0332b74bf04714e46102e66bc049e9c8679065049`.

Một lần chạy Chrome từ desktop developer không mở được DevTools endpoint vì executable chuyển sang browser session hiện có; lần đó được tính là FAIL local, không phải browser PASS. Hai hosted real-Chrome runs nêu trên đã chạy đầy đủ và là bằng chứng chấp nhận.

### Local verification and limitations

- Trên worktree hiện tại, `node --check tests\\windowsJobRunnerTests.js` và compile độc lập cả test fixture lẫn production launcher bằng MinGW đã PASS. Không chạy Windows executable trong desktop local do Windows Application Control; full native process execution được xác nhận bằng Windows-hosted Actions dưới đây.
- Hosted Windows full suite: 74/74 unique assertions; Job Object stress 202/202; root-exit drain; MI-18 hai batch tám GDB timeout; workspace cleanup và slot recovery PASS. Client Vitest là 25 assertions trong aggregate.
- Vite cảnh báo bundle 725 kB vượt ngưỡng 500 kB; CI client install có 7 dependency vulnerabilities (2 moderate, 5 high). Đây là hạn chế ngoài thay đổi process lifecycle và cần triage trước public release.
- Nếu supervisor mất final status, API vẫn báo interrupted/unverified và giữ concurrency slot/workspace. Điều này bảo toàn tài nguyên nhưng có thể giảm capacity tới khi operator xử lý hoặc restart service.
- Job Object quản lý vòng đời process, không cô lập filesystem/network/host APIs và không phải sandbox. Native C++ runner vẫn local-only cho nguồn tin cậy; không public/multi-tenant.
- Browser acceptance evidence là hai hosted real-Chrome jobs; local desktop Chrome smoke không hoàn tất do DevTools endpoint không mở được.

PR vẫn mở, review threads chưa được resolve; khuyến nghị **GO cho independent reviewer re-review, NO-GO merge/release khi chưa có reviewer decision và human authorization**. `main` không đổi; không merge, tag, GitHub Release hay deployment.
