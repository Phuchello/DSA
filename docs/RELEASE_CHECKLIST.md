# DSA FlowLab P0 — Checklist kiểm toán PR #1

Source/test SHA: [9ecf6cc2facc5ec50e7fc9933740f551a08d473e](https://github.com/Phuchello/DSA/commit/9ecf6cc2facc5ec50e7fc9933740f551a08d473e). PR [#1](https://github.com/Phuchello/DSA/pull/1) đang mở, chưa merge.

## Final Windows process-ownership gate

- [x] Reproduced historical high-contention failure: Windows CI helper bị giới hạn Node 12 giây kết thúc dưới MI-18; logs ghi nhận interrupted/unverified và runner cleanup thấy orphan GDB. Không gán một subphase cụ thể vì lần lỗi không có phase timestamps.
- [x] Chọn Job Object thay cho production Toolhelp polling: `PROC_THREAD_ATTRIBUTE_JOB_LIST` gắn target trong `CreateProcessW` trước `ResumeThread`; Job dùng `KILL_ON_JOB_CLOSE`, handle list hạn chế, không breakaway.
- [x] Bounded termination: `TerminateJobObject`/active count 0 tối đa 3.5s; Node supervisor deadline 6s. Missing final status => interrupted/unverified, giữ workspace và concurrency slot.
- [x] Windows API support floor được ghi nhận: Windows 10+/Server 2016+ cho `PROC_THREAD_ATTRIBUTE_JOB_LIST`; incompatible nested Job/OS fail closed.
- [x] Windows process-tree regression 13/13; P/Invoke error injection 19/19; Job stress 128/128 trên mỗi Windows job; hai vòng × tám process trees, exact PID/creation identities, heartbeat, descendants, handle growth.
- [x] P/Invoke injection validity: original `SetLastErrorNative` export mismatch reproduced; explicit `EntryPoint="SetLastError"`; current logs prove error 5, `Win32Exception.NativeErrorCode=5`, expected snapshot phase, no binding exception, no primary termination call, and cleanup 19/19.
- [x] MI-18 chạy hai batch thật, mỗi batch tám concurrent GDB timeouts; verified cleanup, workspace deletion và capacity recovery PASS.
- [x] Golden/runtime suite: 17/17 baseline, 11/11 normalizer, 21/21 invariants, 25 client assertions; tổng 74/74 unique assertions trên mỗi OS.

## Latest-head CI evidence

Hai CI run độc lập và đồng thời trên source/test SHA `9ecf6cc2facc5ec50e7fc9933740f551a08d473e`, cả hai ma trận Linux + Windows/native/Chrome đều PASS:

- PR [run 39725121832](https://github.com/Phuchello/DSA/actions/runs/39725121832): Linux [119647149233](https://github.com/Phuchello/DSA/actions/runs/39725121832/job/119647149233), Windows [119647496134](https://github.com/Phuchello/DSA/actions/runs/39725121832/job/119647496134), browser artifact [12402437554](https://github.com/Phuchello/DSA/actions/runs/39725121832/artifacts/12402437554), SHA-256 `175eec32bd788c502398f90e0622e097a5d46abfed70a8d91026c5b6404c61db`.
- Push [run 39725116557](https://github.com/Phuchello/DSA/actions/runs/39725116557): Linux [119647132155](https://github.com/Phuchello/DSA/actions/runs/39725116557/job/119647132155), Windows [119647526674](https://github.com/Phuchello/DSA/actions/runs/39725116557/job/119647526674), browser artifact [12402987783](https://github.com/Phuchello/DSA/actions/runs/39725116557/artifacts/12402987783), SHA-256 `af14e7df04b6649c0f98c6a0332b74bf04714e46102e66bc049e9c8679065049`.
- [x] Real Chrome 155.0.8059.85 + backend thật: edit C++, stdin/stdout, timeline, topology/pointer identities, Beginner/Advanced tiếng Việt, stale response bị bỏ và rerun khớp; console sạch.
- [x] MI-09, MI-14, MI-19, MI-20, MI-21 và `cout` chronology PASS.
- [x] Local Windows build/full suite PASS. Local Chrome desktop không mở DevTools nên được ghi nhận là FAIL local; acceptance browser evidence lấy từ hai hosted CI jobs độc lập.

## Remaining release boundary

- [ ] Independent reviewer re-review bốn review threads; vẫn để unresolved.
- [ ] Human authorization cho merge: **chưa có**.
- [ ] Triaged 7 client dependency audit vulnerabilities (2 moderate, 5 high): **chưa xong, ngoài scope remediation**.
- [ ] Merge, thay đổi `main`, bật auto-merge, tạo tag/release, public deploy hoặc public native runner: **không thực hiện**.

**Quyết định: GO cho independent reviewer re-review; NO-GO merge/release cho tới khi reviewer và human authorization hoàn tất, đồng thời dependency warnings được triage.** Native runner local-only, trusted-code-only; Job Object không phải sandbox.
