# Checklist phát hành v0.1.0-p0

Trạng thái: quality gates kỹ thuật PASS trên code candidate; PR #1 chờ cập nhật hồ sơ/review replies trước khi mở human review. Chưa merge/tag/publish/deploy.  
Code candidate: [6a5430a0e538c0b4a3c54d360844d149ae0166a5](https://github.com/Phuchello/DSA/commit/6a5430a0e538c0b4a3c54d360844d149ae0166a5).  
CI matrix: [PR run 39586265810](https://github.com/Phuchello/DSA/actions/runs/39586265810) — Linux job 119175818493 và Windows/native/Chrome job 119176349541 PASS.  
Version: package root/client/server 0.1.0-p0; tag đề xuất v0.1.0-p0.

## Quality gates
- [x] Linux build/type-check, 23 Vitest tests, 10 normalizer tests, native g++/GDB suite: PASS.
- [x] Windows build and native MinGW g++/GDB suite: 69/69 unique assertions PASS.
- [x] Process-tree timeout, descendants, cleanup and concurrency recovery: MI-18 PASS on Linux and Windows.
- [x] Frame-qualified recursion pointers: normalizer tests and MI-20 PASS.
- [x] Crash/truncation status and partial trace: frontend, MI-17 and MI-21 PASS.
- [x] Stack/heap NODE allocation evidence: normalizer and MI-19 PASS.
- [x] Stdout chronology, golden trace, MI-09 and MI-14: PASS.
- [x] Real Chrome against real backend: editor, stdin/stdout, timeline, topology, Vietnamese modes and pending-response stale protection PASS.
- [x] Browser logs, JSON evidence, response trace and screenshots retained — [artifact 12340605851](https://github.com/Phuchello/DSA/actions/runs/39586265810/artifacts/12340605851), 253,465 bytes; expires 04/11/2026 10:44:49 UTC.
- [x] Vietnamese remains the default language; local-only execution restriction preserved.
- [x] Four findings have regression evidence; reply without resolving threads.

## Cần human review/authorization
- [ ] Human reviews diff, audit evidence, limitations and review replies.
- [ ] Human explicitly approves merge into main.
- [ ] After authorized merge, verify CI on the merge commit.
- [ ] Human separately authorizes tag v0.1.0-p0.
- [ ] Human separately authorizes prerelease publication.

Không merge, bật auto-merge, tag, publish, deploy hoặc đính kèm native runner binary trong công việc này.
