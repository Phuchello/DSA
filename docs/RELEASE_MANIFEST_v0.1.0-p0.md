# Manifest phát hành đề xuất — v0.1.0-p0

**Trạng thái:** đề xuất; chưa tạo tag hoặc GitHub Release.

| Trường | Giá trị |
|---|---|
| Repository | `Phuchello/DSA` |
| Source branch | `dev/flowlab-p0` |
| Target branch | `main` |
| Version | `0.1.0-p0` |
| Tag | `v0.1.0-p0` |
| Release title | `DSA FlowLab v0.1.0-p0 — Web P0` |
| Release type | GitHub prerelease |
| Target commit | Commit trên `main` sau khi được human review/merge; hiện chưa xác định |
| Release notes | [docs/RELEASE_NOTES_v0.1.0-p0.md](RELEASE_NOTES_v0.1.0-p0.md) |
| Assets | Không có binary runner; source archive chỉ sau khi tag được human-approved |
| Draft/release state | Chưa tạo draft vì thao tác draft có thể tạo tag |

## Quy trình bắt buộc

1. Human review và phê duyệt PR.
2. Human cho phép merge vào `main`.
3. CI xác minh commit đã merge.
4. Human cho phép tag trên đúng commit `main`.
5. Human cho phép publish prerelease.

Manifest không cấp quyền cho các hành động trên.
