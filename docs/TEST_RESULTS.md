# DSA FlowLab — Kết quả kiểm thử PR #1

Cập nhật: 22/10/2026. Source/test SHA đã kiểm chứng: [9ecf6cc2facc5ec50e7fc9933740f551a08d473e](https://github.com/Phuchello/DSA/commit/9ecf6cc2facc5ec50e7fc9933740f551a08d473e) trên `dev/flowlab-p0`. PR [#1](https://github.com/Phuchello/DSA/pull/1) vẫn mở, chưa merge.

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

### Automated CI trên source/test SHA mới nhất

Hai workflow chạy độc lập và đồng thời trên cùng SHA `9ecf6cc2facc5ec50e7fc9933740f551a08d473e`; cả hai ma trận Linux và Windows đều PASS:

- PR [run 39725121832](https://github.com/Phuchello/DSA/actions/runs/39725121832): Linux [job 119647149233](https://github.com/Phuchello/DSA/actions/runs/39725121832/job/119647149233), Windows/native/Chrome [job 119647496134](https://github.com/Phuchello/DSA/actions/runs/39725121832/job/119647496134).
- Push [run 39725116557](https://github.com/Phuchello/DSA/actions/runs/39725116557): Linux [job 119647132155](https://github.com/Phuchello/DSA/actions/runs/39725116557/job/119647132155), Windows/native/Chrome [job 119647526674](https://github.com/Phuchello/DSA/actions/runs/39725116557/job/119647526674).
- Mỗi OS: 74/74 unique assertions; Linux process-tree 4/4; Windows process-tree 13/13.
- Mỗi Windows job: Job Object stress 128/128 assertion checks, hai vòng × tám owned roots mỗi vòng (16 timeout executions), mỗi root có hai descendant; OS PID/creation identities, heartbeat dừng, inherited/non-inherited stdio và active Job count 0 được kiểm tra. Hai vòng GDB timeout thật của MI-18 cũng PASS (mỗi vòng tám request), sau đó workspace cleanup và slot recovery được xác nhận.
- Windows fault-injection cũ vẫn PASS: Process32NextW error 5, `Win32Exception.NativeErrorCode=5`, 19/19 checks gồm cleanup; late-child và unverified paths vẫn fail-closed.
- Stress supervisor deadline riêng PASS: response `interrupted`, không nhận là verified cleanup; đúng các GDB/inferior identities được xác nhận đã thoát sau khi Job handle đóng; workspace/slot được giữ, bảy slot còn lại chạy thành công. Node handle count: PR 192→193; push 200→203, trong ngưỡng +4.
- Cả hai OS báo `17/17 baseline; 11/11 normalizer; 21/21 invariants; 25 client assertions; 74/74 unique assertions`. MI-09, MI-14, MI-19, MI-20, MI-21 đều PASS.

### Real-browser verification

Hai Windows CI jobs dùng Chrome thật `155.0.8059.85` cùng backend C++/GDB thật, không mock `/api/run`. Cả hai PASS:

- PR log ghi nhận paste/edit C++, stdin `3\n3 0 8\n3`, stdout `0 8`, timeline `0→1→0`, topology với `L.pHead`, `L.pTail`, `k`, `L`, `p`, Beginner/Advanced và UI tiếng Việt.
- Khi stdin cũ `1\n7\n3` đang pending rồi đổi thành `1\n8\n3`, trace vẫn stale; response thật stdout `7` bị bỏ qua. Rerun với input hiện tại trả stdout `8` và xóa stale warning.
- Browser console không có exception/error.
- PR artifact [12402437554](https://github.com/Phuchello/DSA/actions/runs/39725121832/artifacts/12402437554), 255,207 bytes, SHA-256 `175eec32bd788c502398f90e0622e097a5d46abfed70a8d91026c5b6404c61db`.
- Push artifact [12402987783](https://github.com/Phuchello/DSA/actions/runs/39725116557/artifacts/12402987783), 255,485 bytes, SHA-256 `af14e7df04b6649c0f98c6a0332b74bf04714e46102e66bc049e9c8679065049`.

Một lần chạy Chrome từ desktop developer không mở được DevTools endpoint vì executable chuyển sang browser session hiện có; lần đó được tính là FAIL local, không phải browser PASS. Hai hosted real-Chrome runs nêu trên đã chạy đầy đủ và là bằng chứng chấp nhận.

### Local automated verification và limitations

- `npm run build`: server TypeScript, native Windows launcher và client build PASS; Vite vẫn cảnh báo bundle 725 kB vượt ngưỡng 500 kB.
- `npm test`: 74/74 unique assertions PASS trên Windows; process-tree 13/13, Job Object 128/128, MI-18 hai vòng tám GDB timeout, cleanup/recovery PASS. Client Vitest riêng: 25/25.
- `npm ci` của client trên CI báo 7 dependency vulnerabilities (2 moderate, 5 high); thay đổi process lifecycle không nâng cấp dependency. Cần triage riêng trước khi public release.
- Khi cleanup không được xác minh, service giữ một concurrency slot và workspace để bảo toàn tài nguyên; điều đó có thể làm giảm capacity tới khi operator xử lý/restart. Hosted tests xác minh đường này báo `interrupted`, không giả thành timeout thành công.
- Job Object không chặn code độc hại khỏi host API, không cách ly filesystem/network và không thay thế OS sandbox. Không mở native runner cho public/multi-tenant execution.
- Local full Chrome smoke không hoàn thành trên desktop này; chỉ hai job CI trên đây chứng minh browser flow.

PR vẫn mở, review threads chưa được resolve; khuyến nghị **GO cho independent reviewer re-review, NO-GO merge/release khi chưa có reviewer decision và human authorization**. `main` không đổi; không merge, tag, GitHub Release hay deployment.
