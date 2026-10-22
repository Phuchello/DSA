# DSA FlowLab P0 — Checklist kiểm toán PR #1

Source/test SHA: [e35ba3e7e004874dec7d6c2e69050ea34cb393c2](https://github.com/Phuchello/DSA/commit/e35ba3e7e004874dec7d6c2e69050ea34cb393c2). PR [#1](https://github.com/Phuchello/DSA/pull/1) đang mở, chưa merge.

## Final Windows process-ownership gate

- [x] Reproduced historical high-contention failure: Windows CI helper bị giới hạn Node 12 giây kết thúc dưới MI-18; logs ghi nhận interrupted/unverified và runner cleanup thấy orphan GDB. Không gán một subphase cụ thể vì lần lỗi không có phase timestamps.
- [x] Chọn Job Object thay cho production Toolhelp polling: `PROC_THREAD_ATTRIBUTE_JOB_LIST` gắn target trong `CreateProcessW` trước `ResumeThread`; Job dùng `KILL_ON_JOB_CLOSE`, handle list hạn chế, không breakaway.
- [x] Bounded termination: `TerminateJobObject`/active count 0 tối đa 3.5s; Node supervisor deadline 6s. Missing final status => interrupted/unverified, giữ workspace và concurrency slot.
- [x] Root-exit race regression: bounded natural descendant drain tối đa 500ms, vẫn ưu tiên stop/timeout; cuối bound còn process thì force terminate, không báo normal completion. Hosted Windows logs đo được 250ms push và 265ms PR; exact root/child identities exited.
- [x] Windows API support floor được ghi nhận: Windows 10+/Server 2016+ cho `PROC_THREAD_ATTRIBUTE_JOB_LIST`; incompatible nested Job/OS fail closed.
- [x] Windows process-tree regression 13/13; P/Invoke error injection 19/19; Job stress 202/202 trên mỗi Windows job; hai vòng × tám process trees, exact PID/creation identities, heartbeat, descendants, handle growth.
- [x] P/Invoke injection validity: original `SetLastErrorNative` export mismatch reproduced; explicit `EntryPoint="SetLastError"`; current logs prove error 5, `Win32Exception.NativeErrorCode=5`, expected snapshot phase, no binding exception, no primary termination call, and cleanup 19/19.
- [x] MI-18 chạy hai batch thật, mỗi batch tám concurrent GDB timeouts; verified cleanup, workspace deletion và capacity recovery PASS.
- [x] Golden/runtime suite: 17/17 baseline, 11/11 normalizer, 21/21 invariants, 25 client assertions; tổng 74/74 unique assertions trên mỗi OS.

## Latest-head CI evidence

Hai CI run độc lập và đồng thời trên source/test SHA `e35ba3e7e004874dec7d6c2e69050ea34cb393c2`, cả hai ma trận Linux + Windows/native/Chrome đều PASS:

- PR [run 39731178032](https://github.com/Phuchello/DSA/actions/runs/39731178032): Linux [119666335082](https://github.com/Phuchello/DSA/actions/runs/39731178032/job/119666335082), Windows [119666657833](https://github.com/Phuchello/DSA/actions/runs/39731178032/job/119666657833), browser artifact [12404544012](https://github.com/Phuchello/DSA/actions/runs/39731178032/artifacts/12404544012), SHA-256 `8248eff29b9c9ac93afdb0147d23aa5ec3fad2163f91d6ccb8b5f6bd58b73a89`.
- Push [run 39731173170](https://github.com/Phuchello/DSA/actions/runs/39731173170): Linux [119666320150](https://github.com/Phuchello/DSA/actions/runs/39731173170/job/119666320150), Windows [119666655469](https://github.com/Phuchello/DSA/actions/runs/39731173170/job/119666655469), browser artifact [12404743352](https://github.com/Phuchello/DSA/actions/runs/39731173170/artifacts/12404743352), SHA-256 `bf70cea4e6d047f88b918cbf0a02124eb97f904d793a6aa37d8061f16a350098`.
- [x] Mỗi OS: 74/74 unique assertions. Windows: Process32NextW 19/19 gồm cleanup; process-tree 13/13; Job Object stress 202/202; MI-18 hai batch × tám timeout thật.
- [x] Root-exit child race: production launcher chờ child kết thúc tự nhiên trong bounded drain; CI ghi nhận 250ms push / 265ms PR, hai exact process identities exited và status verified.
- [x] Real Chrome 155.0.8059.85 + native backend: code edit/paste, stdin/stdout, timeline, topology/pointers, Vietnamese Beginner/Advanced, pending-request stale protection; console sạch.
- [x] Từng failure attempt trong hardening được giữ trong [TEST_RESULTS.md](TEST_RESULTS.md); fixture assertion sai đã sửa, không bị tính là product PASS.

## Remaining release boundary

- [ ] Independent reviewer re-review bốn review threads; vẫn để unresolved.
- [ ] Human authorization cho merge: **chưa có**.
- [ ] Triaged 7 client dependency audit vulnerabilities (2 moderate, 5 high): **chưa xong, ngoài scope remediation**.
- [ ] Merge, thay đổi `main`, bật auto-merge, tạo tag/release, public deploy hoặc public native runner: **không thực hiện**.

**Quyết định: GO cho independent reviewer re-review; NO-GO merge/release cho tới khi reviewer và human authorization hoàn tất, đồng thời dependency warnings được triage.** Native runner local-only, trusted-code-only; Job Object không phải sandbox.
