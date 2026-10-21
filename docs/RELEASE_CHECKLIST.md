# Checklist phát hành v0.1.0-p0

**Trạng thái:** chuẩn bị review; chưa merge, tag hoặc publish.  
**Phiên bản package:** root/client/server `0.1.0-p0`. **Tag dự kiến:** `v0.1.0-p0`.

## Chất lượng candidate

- [ ] Linux build, type-check, Vitest và normalizer CI xanh trên candidate.
- [ ] Windows build, native g++/GDB, memory invariants và real Chrome smoke xanh trên candidate.
- [ ] Browser artifact được upload; xác minh log, JSON evidence và screenshots.
- [ ] Tách số lượng test theo job, không cộng lặp Vitest với full suite.
- [x] Baseline trước candidate: [run 39541439517](https://github.com/Phuchello/DSA/actions/runs/39541439517) xanh trên `b50bc14451cde1a11687e2b0b2fc005cf07963ae`; candidate thay đổi Host guard và version metadata nên cần chạy lại.

## Review và phát hành — cần người phê duyệt

- [ ] Review source diff, security notes, release notes, manifest và CI artifact.
- [ ] Human phê duyệt PR trước khi merge vào `main`.
- [ ] Sau khi có quyền merge, kiểm tra CI trên merge commit của `main`.
- [ ] Human phê duyệt riêng việc tạo `v0.1.0-p0` trên đúng commit đã merge.
- [ ] Human phê duyệt riêng việc publish prerelease.
- [ ] Không đính kèm binary native runner; chỉ chạy trong phạm vi local đáng tin cậy.

## Bằng chứng

Run trước candidate: [Actions 39541439517](https://github.com/Phuchello/DSA/actions/runs/39541439517); artifact [browser-smoke-evidence-39541439517-1](https://github.com/Phuchello/DSA/actions/runs/39541439517/artifacts/12319995987). Kết quả candidate mới sẽ được ghi sau CI.
