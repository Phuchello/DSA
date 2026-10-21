# DSA FlowLab — Kết quả kiểm thử P0 Round 3

**Cập nhật:** 21/10/2026
**Nhánh:** `dev/flowlab-p0`

## Kết quả CI của commit nền

[GitHub Actions run 39438217969](https://github.com/Phuchello/DSA/actions/runs/39438217969) chạy trên commit `3dde96678beb195073edc5eca8e133d4acaea4a6`:

- **Linux:** PASS. Build/typecheck, 11 client test và 8 normalizer test thành công.
- **Windows:** FAIL. Build thành công; bộ test thực thi nhưng MI-09 và MI-14 thất bại. 15/17 memory invariant khác PASS.
- CI Windows báo MI-09 không thấy tối thiểu ba frame đệ quy và MI-14 đánh dấu `n` là `freed` khi `flag=0`.
- Golden trace CI ghi 29 snapshot. Run dùng GCC `15.2.0`, GDB `17.1`.

## Kết quả local Windows sau thay đổi Round 3

Toolchain: MinGW-W64 GCC `16.1.0`, GDB `17.2`, Node `24.19.0`. Lần chạy đầy đủ gần nhất:

```
12/12 baseline
8/8 normalizer
17/17 memory invariants
11/11 client test qua MI-12
48 test case executions / 48 test case checks duy nhất
```

TC-GOLDEN-01 trả đúng `0 8 2 4 7`. Assertion trace completeness xác nhận 161 snapshot gồm 7 allocation, 21 pointer traversal, 3 unlink, 2 deallocation, 17 call và 18 return. Snapshot count được ghi để quan sát; không có ngưỡng count cố định.

MI-09 ghi nhận các frame theo từng snapshot. Ở độ sâu lớn nhất có `main` và bốn `SumList` frame; các tham số `p` lần lượt trỏ tới ba NODE và `nullptr`. Frame giữ source location, depth, invocation-local parameter value và caller/child ID.

MI-14 có chẩn đoán runtime: với `flag=0`, stdout là `77`, `n` là `valid`, không có deallocation `delete n`; với `flag=1`, stdout là `-1`, `_ZdlPv` nhận con trỏ qua `RCX` và FinishBreakpoint xác nhận return trước snapshot sau lệnh delete. Regression `std::vector` ghi rõ call stack STL và giữ NODE còn sống. MI-05 xác minh hai alias cùng chuyển thành `freed` sau một lần delete.

## Cách tính lượt chạy trên toàn workflow

Hai job GitHub hiện chạy tổng cộng 67 test case executions: Windows chạy baseline 12 + normalizer 8 + invariants 17 + client 11 (MI-12); Linux chạy lại client 11 và normalizer 8. Tổng test case duy nhất là 48. Các lượt client/normalizer chạy lại là executions lặp, không phải test case mới.

## Trạng thái xác minh

Kết quả local không được gọi là kết quả GitHub CI. Kết quả CI mới cho commit đã sửa chưa có ở tài liệu này; giữ **NO-GO** cho đến khi Linux và Windows cùng PASS. Lần chạy Windows local có một lần bị Application Control của máy chặn một executable tạm; lần chạy đầy đủ gần nhất sau đó hoàn tất 48/48. Không test nào bị skip hoặc chuyển thành PASS do inconclusive.
