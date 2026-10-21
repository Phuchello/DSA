# DSA FlowLab — Kết quả kiểm thử P0 Round 3

**Cập nhật:** 21/10/2026

**Nhánh:** dev/flowlab-p0

## Kết quả cuối trên GitHub Actions

Runtime fix tại commit [9ac0acf3bf5b36c2fd1e01c10159b22e264ef880](https://github.com/Phuchello/DSA/commit/9ac0acf3bf5b36c2fd1e01c10159b22e264ef880) được xác minh bởi [Actions run 39530079680](https://github.com/Phuchello/DSA/actions/runs/39530079680). Run kết thúc thành công trên cả hai job:

- **Linux — PASS:** client build/typecheck, 11 Vitest test và 8 normalizer test.
- **Windows — PASS:** full build và npm test; 12/12 baseline, 8/8 normalizer, 17/17 memory invariants, 11 client test qua MI-12.
- **Tổng:** 67 test executions trên hai job, 48 test case duy nhất. Linux lặp lại 11 client và 8 normalizer case.

## Runtime evidence trong Windows log

- **TC-GOLDEN-01 — PASS:** output 0 8 2 4 7; trace có 161 snapshot, 7 allocation, 21 traversal, 3 unlink, 2 deallocation, 17 call và 18 return. Semantic completeness assertions đạt; tổng snapshot không phải ngưỡng PASS.
- **MI-09 — PASS:** độ sâu tối đa có main và bốn SumList invocation; p giữ địa chỉ ba NODE tương ứng rồi nullptr. Source location, parameter values, thứ tự outer-to-inner, parent/child ID và call/return đều được kiểm tra.
- **MI-14 — PASS:** flag=1 in -1; GDB log ghi event completed tại delete n;, symbol _ZdlPv, register RCX, candidate address và generation 1. flag=0 in 77, n còn valid, không có completion tại delete n;.
- **STL regression — PASS:** vector cleanup được nhận diện qua std::new_allocator/allocator_traits và bỏ qua; NODE vẫn live.
- **Alias regression — PASS:** MI-05 xác nhận hai alias cùng quan sát deallocation của một NODE.

## Các lượt chẩn đoán CI

Run nền [39438217969](https://github.com/Phuchello/DSA/actions/runs/39438217969) thất bại MI-09/MI-14. Run [39528771486](https://github.com/Phuchello/DSA/actions/runs/39528771486) phơi bày tên symbol Windows dạng libstdc++-6!_ZdlPv, frame đệ quy không xuất hiện và parser Vitest bị ảnh hưởng bởi output Windows. Run [39529576720](https://github.com/Phuchello/DSA/actions/runs/39529576720) xác nhận deallocation và MI-12 đã sửa; log còn cho thấy GDB file-regex skip rules làm mất toàn bộ user function frame. Sau khi xử lý các nguyên nhân này, run cuối 39530079680 pass cả Linux lẫn Windows.

Local Windows full suite trước thay đổi skip-rule cuối cùng: 48/48 PASS với MinGW GCC 16.1.0, GDB 17.2, Node 24.19.0. Một lần chạy sau đó bị Application Control chặn binary tạm nhiều lần và đã dừng; kết quả cuối của phiên bản hiện tại là GitHub Actions run ở trên.
