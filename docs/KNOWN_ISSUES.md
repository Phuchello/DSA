# DSA FlowLab — Giới hạn đã biết

Cập nhật trạng thái trên source/test SHA [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2), PR [#1](https://github.com/Phuchello/DSA/pull/1).

## Windows process ownership hiện tại

Lỗi MI-18 trước đây được chuyển từ Toolhelp polling sang Windows Job Object launcher. Trên source/test SHA [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2), PR [39731178032](https://github.com/Phuchello/DSA/actions/runs/39731178032) và push [39731173170](https://github.com/Phuchello/DSA/actions/runs/39731173170) đều pass ma trận Linux + Windows/native/Chrome. Mỗi Windows job: process-tree 13/13, Job stress 202/202, full native suite 74/74, hai batch × tám GDB timeout thật, cùng real Chrome smoke. Chi tiết, artifacts và các lần CI fail trong quá trình sửa ở [TEST_RESULTS.md](TEST_RESULTS.md).

Sau root exit, launcher cho descendant tối đa 500 ms để kết thúc tự nhiên, đồng thời kiểm tra timeout event; regression xác nhận root có thể thoát trước descendant 250 ms. PR CI ghi nhận drain 265 ms, push CI 250 ms, cả hai exact identities thoát và Job active count verified bằng 0. Nếu hết bound mà process vẫn còn, launcher force-terminate và không báo completion bình thường.

Launcher dùng `PROC_THREAD_ATTRIBUTE_JOB_LIST` để gắn process ngay trong `CreateProcessW`, khi target còn suspended; Job có `KILL_ON_JOB_CLOSE`. Timeout gọi `TerminateJobObject` rồi kiểm tra active count bằng 0 trong 3.5 giây. Node giới hạn supervisor shutdown ở 6 giây. Thiếu final verification thì API trả interrupted/unverified và giữ slot/workspace. Không suy diễn completion từ một timeout hoặc Promise settle.

### Process32NextW fault-injection test

P/Invoke test-validity issue đã được sửa: tên export `SetLastError` được khai báo tường minh; regression yêu cầu injected error và error đọc lại từ snapshot đều là 5, exception chain là `Win32Exception.NativeErrorCode=5`, không có lỗi binding/loading ngoài dự kiến, `taskkill` chưa chạy, và fixture cleanup hoàn tất. Windows CI hiện tại xác nhận 18/18 check trước cleanup, 19/19 gồm cleanup. Chi tiết tái hiện trước sửa và log sau sửa trong [TEST_RESULTS.md](TEST_RESULTS.md). Toolhelp test seam không thay thế production Job Object.

API `PROC_THREAD_ATTRIBUTE_JOB_LIST` yêu cầu Windows 10+ hoặc Windows Server 2016+; môi trường Job cha có thể áp dụng ràng buộc nested-job. Không hỗ trợ tương thích sẽ fail closed trước khi target chạy. Đã xác minh trên GitHub-hosted `windows-latest` và developer Windows này, không phải mọi phiên bản/host policy. Xem [Microsoft UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute) và [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

### Failure path còn lại

Nếu supervisor mất status cuối, caller không thể chứng minh số process cuối cùng bằng Job API vì handle chỉ thuộc supervisor. Việc đóng supervisor yêu cầu kernel `KILL_ON_JOB_CLOSE`; response vẫn unverified, còn execution slot và workspace được giữ. Stress harness chứng minh đúng GDB/inferior identities đã thoát sau khi handle đóng, nhưng sản phẩm không báo verified cho đường này. Giữ capacity bảo thủ có thể cần operator xử lý hoặc restart service.

### Root cause lịch sử đã khắc phục

Trên source/test SHA `159d5a9`, tám Windows GDB timeout đồng thời làm Toolhelp/PowerShell helper vượt outer limit Node 12 giây; attempt lỗi log helper bị kết thúc (`signal=SIGTERM`, `killed=true`) và runner cleanup thấy orphan GDB. Các job lỗi lịch sử: PR [119324367670](https://github.com/Phuchello/DSA/actions/runs/39629546638/job/119324367670), push [119324625939](https://github.com/Phuchello/DSA/actions/runs/39629540435/job/119324625939). Log không đo từng phase trong lần lỗi nên không quy nguyên nhân cho một syscall cụ thể. Toolhelp không có ownership boundary nguyên tử; chỉ tăng timeout không đủ.

## Giới hạn bảo mật

Native g++/GDB chạy với quyền của tài khoản host. Static filters, request/time/concurrency limits, loopback binding và Job Objects chỉ là guardrails/lifecycle management, **không phải sandbox**. Chỉ chạy mã nguồn tin cậy local; không public hoặc multi-tenant trước khi có OS-level isolation. Không bật deployment trong remediation này.

### Lịch sử regression trong lượt hardening này

- [39728385384](https://github.com/Phuchello/DSA/actions/runs/39728385384): fixture metadata readiness timeout trước browser test.
- [39729245592](https://github.com/Phuchello/DSA/actions/runs/39729245592) và [39729250557](https://github.com/Phuchello/DSA/actions/runs/39729250557): test giả định child không có standard handles hợp lệ. [39729820174](https://github.com/Phuchello/DSA/actions/runs/39729820174) và [39729824962](https://github.com/Phuchello/DSA/actions/runs/39729824962): assertion sai về handle validity lặp lại; bản cuối so khớp explicit fixture handle identity.
- [39730307595](https://github.com/Phuchello/DSA/actions/runs/39730307595): MI-18 phát hiện root-exit/descendant race; fix và deterministic test có trên SHA hiện tại.

## Dependency và browser/build

- CI client dependency install báo 7 vulnerabilities (2 moderate, 5 high); chưa triage/upgrade trong thay đổi tập trung process lifecycle.
- Bundle Vite khoảng 725 kB chưa nén vượt cảnh báo 500 kB; không thuộc blocker này.
- Latest real-browser evidence: PR [artifact 12404544012](https://github.com/Phuchello/DSA/actions/runs/39731178032/artifacts/12404544012) và push [artifact 12404743352](https://github.com/Phuchello/DSA/actions/runs/39731173170/artifacts/12404743352), Chrome 155.0.8059.85 và backend thật. Chỉ bao phủ flow linked-list, timeline, pointer topology, tiếng Việt và stale-request; không bảo đảm mọi browser/device/accessibility.
- Local desktop browser smoke trên developer Windows không mở được DevTools do chuyển tới browser session đã chạy; đây là lần chạy FAIL local. Hai hosted CI jobs độc lập pass đầy đủ; local failure không được tính là pass.

## Trace semantics

Visualizer hỗ trợ tập con C++ đã kiểm thử, không phải debugger tổng quát. Heap NODE cần evidence allocator từ GDB; địa chỉ không đủ chứng minh ownership được phân loại unknown. Stdout được ghi theo snapshot khi quan sát được; output cuối được hiển thị riêng nếu chỉ biết sau khi chương trình kết thúc.
