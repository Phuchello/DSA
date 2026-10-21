# Checklist phát hành v0.1.0-p0

**Trạng thái:** sẵn sàng cho human review; chưa merge/tag/publish.  
**Version:** package root/client/server `0.1.0-p0`; tag đề xuất `v0.1.0-p0`.

## Candidate quality gates

- [x] Linux build, type-check, Vitest và normalizer CI PASS — [run 39578131020](https://github.com/Phuchello/DSA/actions/runs/39578131020).
- [x] Windows build, native g++/GDB, full automated suite PASS — 54/54 unique assertions trong cùng run.
- [x] TC-STDOUT-CHRONOLOGY PASS; golden trace, MI-09, MI-14 và 17 memory invariants PASS.
- [x] Real Chrome trên backend thật: edit C++, stdin/stdout, timeline, topology/pointers, tiếng Việt Beginner/Advanced, stale-response race PASS.
- [x] Browser log, JSON evidence, actual trace và screenshots được upload — [artifact 12335352037](https://github.com/Phuchello/DSA/actions/runs/39578131020/artifacts/12335352037), hết hạn 04/11/2026.
- [x] Package metadata/lockfiles root/client/server đồng bộ `0.1.0-p0`; không đổi dependency.
- [x] Review giới hạn bảo mật: runner local-only, không sandbox, không public deployment.

## Cần human review/authorization

- [ ] Review diff, tài liệu release/security và artifact.
- [ ] Phê duyệt PR trước khi merge vào `main`.
- [ ] Sau khi được cho phép merge, kiểm tra CI trên merge commit `main`.
- [ ] Phê duyệt riêng việc tạo tag `v0.1.0-p0` đúng trên commit đã merge.
- [ ] Phê duyệt riêng việc publish prerelease.
- [ ] Không đính kèm binary runner; chỉ chạy C++ đáng tin cậy tại local.

Không tạo auto-merge. Không merge, tag, publish hay deploy trong bước chuẩn bị này.
