# DSA FlowLab: Trạng thái kiểm toán P0 Round 3

**Cập nhật:** 21/10/2026

**Nhánh:** dev/flowlab-p0

**Commit runtime đã xác minh:** [9ac0acf3bf5b36c2fd1e01c10159b22e264ef880](https://github.com/Phuchello/DSA/commit/9ac0acf3bf5b36c2fd1e01c10159b22e264ef880)

**GitHub Actions:** [run 39530079680](https://github.com/Phuchello/DSA/actions/runs/39530079680)
**Kết luận:** **GO cho phạm vi kiểm toán runtime correctness P0; NO-GO cho public multi-tenant deployment.**

## 1. Bằng chứng xác minh

| Nguồn | Kết quả | Bằng chứng |
|---|---|---|
| GitHub Actions 39530079680 | Linux **PASS**, Windows **PASS** | Cả hai job hoàn tất trên commit 9ac0acf3; Windows chạy toàn bộ npm test. |
| Windows full suite | **48/48 executions PASS** | 12/12 baseline, 8/8 normalizer, 17/17 memory invariants, 11 client assertions qua MI-12. |
| TC-GOLDEN-01 trên Windows CI | **PASS**, 161 snapshot | 7 allocation, 21 traversal, 3 unlink, 2 deallocation, 17 call và 18 return; semantic completeness assertions đều đạt. |
| MI-09 trên Windows CI | **PASS** | Snapshot sâu nhất có main cùng bốn SumList frame, gồm ba NODE argument và base case nullptr; kiểm tra source location, invocation-local p, depth, caller/child, call/return và thứ tự frame đều đạt. |
| MI-14 trên Windows CI | **PASS** | flag=1: _ZdlPv nhận RCX, candidate khớp NODE generation 1 tại delete n;, FinishBreakpoint xác nhận deallocator return. flag=0: output 77, n=valid, không có deallocation hoàn tất cho delete n;. |
| MI-14 STL regression | **PASS** | Vector cleanup có stack std::__new_allocator/allocator_traits, bị bỏ qua; NODE còn sống. |

## 2. Sửa runtime deallocation

Tracer nhận ABI theo compiler target (RCX cho Windows x64, RDI cho System V x64), chỉ đăng ký symbol delete mangled của GCC, và nhận diện cả symbol có tiền tố module như libstdc++-6!_ZdlPv. Candidate phải khớp địa chỉ NODE đang sống cùng allocation generation. Event từ STL/runtime bị loại. FinishBreakpoint xác nhận operator delete đã return; trạng thái freed chỉ được commit ở snapshot kế tiếp. Khi bằng chứng thiếu hoặc mơ hồ, node không bị đánh dấu freed.

FLOWLAB_DEBUG_DEALLOC=1 bật log gồm symbol, call stack, PC, register, candidate, allocation identity và source execution location.

## 3. Stack đệ quy và trace completeness

Frame chỉ được đưa vào trace khi source file xác nhận là mã người dùng. Mỗi frame giữ source line riêng, tham số theo invocation, frame ID, depth và liên kết parent/child. GDB bỏ qua các file-regex skip rules đã làm mất user frame trên Windows; các frame runtime vẫn được lọc theo tên hàm và source.

Golden test kiểm tra allocation/initialization, pHead/pTail, traversal, unlink, before/after delete, call/return và thay đổi nhìn thấy được. Không đặt ngưỡng cố định theo tổng snapshot. Windows CI GCC 15.2.0/GDB 17.1 và local MinGW GCC 16.1.0/GDB 17.2 có thể tạo số bước khác nhau; assertion ngữ nghĩa hiện xác nhận đầy đủ các thao tác cần thiết trên CI.

Toàn workflow có 67 executions và 48 test case duy nhất: Windows chạy 48; Linux chạy lại 11 client và 8 normalizer case.

## 4. Giới hạn còn lại

Runner gọi g++/gdb trên host với giới hạn và lọc đầu vào; đây chưa phải sandbox an toàn cho C++ tùy ý trên public multi-tenant. Public deployment cần process isolation mức hệ điều hành hoặc microVM. Windows Application Control có thể chặn binary tạm; khi đó run báo lỗi và test fail, không được xem là PASS.
