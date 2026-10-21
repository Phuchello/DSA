# DSA FlowLab — Bàn giao kiểm toán Round 3

**Ngày:** 21/10/2026
**Repository:** [Phuchello/DSA](https://github.com/Phuchello/DSA)
**Nhánh:** `dev/flowlab-p0`
**Trạng thái:** **NO-GO cho đến khi CI mới xác nhận Windows và Linux**

## Cơ sở kiểm toán

Run [39438217969](https://github.com/Phuchello/DSA/actions/runs/39438217969) trên commit `3dde96678beb195073edc5eca8e133d4acaea4a6` có Linux PASS và Windows FAIL tại MI-09, MI-14. Đây là kết quả CI đã xác minh; các báo cáo Round 2 `48/48 PASS` và GO không còn là trạng thái hiện hành.

## Sửa lỗi trong Round 3

### MI-14 — deallocation chỉ khi có bằng chứng đầy đủ

- ABI lấy theo compiler target, không suy từ Python/GDB host: Windows x64 dùng `RCX`; Linux/System V dùng `RDI`.
- Loại các breakpoint demangled trùng với tên mangled; chặn event trùng/alias đang in-flight.
- Candidate phải khớp NODE allocation còn sống và đúng generation.
- Event phải xuất phát trực tiếp từ user code; frame runtime/STL trung gian bị bỏ qua.
- `FinishBreakpoint` xác nhận `operator delete` đã return. Chỉ snapshot kế tiếp mới commit trạng thái `freed`.
- Debug mode `FLOWLAB_DEBUG_DEALLOC=1` ghi symbol, call stack, PC, register, candidate, allocation identity và source execution location.
- Regression bao gồm nhánh delete bỏ qua, nhánh delete thực thi, alias và `std::vector` cleanup.

### MI-09 — frame đệ quy có nguồn và invocation riêng

Frame user chỉ được đưa vào trace khi source file xác nhận là mã người dùng. Mỗi frame giữ tên, source location, độ sâu, parameter values, frame ID và parent/child IDs. Tracer dùng source line riêng cho từng frame, đọc tham số cho đúng invocation và đánh dấu call/return khi stack thay đổi. Test không tạo frame giả; nó đối chiếu các giá trị `p` thực tế với ba NODE và base case `nullptr`.

### Trace completeness và độ trung thực của test

Golden test kiểm tra các thao tác có ý nghĩa: allocation/initialization, endpoint list, traversal, unlink, before/after delete, function call/return và diff nhìn thấy được. Không ràng buộc tổng số snapshot.

Local Windows đầy đủ gần nhất: 48/48 case pass; TC-GOLDEN-01 ghi 161 snapshots cùng 7 allocations, 21 traversals, 3 unlinks, 2 deallocations, 17 calls, 18 returns. CI nền ghi 29 snapshots trên GCC 15.2/GDB 17.1; local dùng GCC 16.1/GDB 17.2. Chưa kết luận rằng con số thấp tự nó là trace bị thiếu; semantic completeness phải qua assertion trong CI mới.

Test runner báo PASS/FAIL theo từng suite, trả nonzero khi có suite fail và tách executions khỏi số case duy nhất. Toàn workflow có 67 executions nhưng 48 case duy nhất do Linux chạy lại 11 client và 8 normalizer case vốn cũng nằm trong lượt Windows qua MI-12 và `npm test`.

## Điều kiện hoàn tất

Chỉ chuyển sang GO khi commit Round 3 được push lên `dev/flowlab-p0`, workflow mới hoàn tất, Linux và Windows cùng PASS, MI-09 và MI-14 evidence xuất hiện trong log Windows, cùng golden trace semantic completeness assertions thành công. Không merge `main`, public deploy hay tuyên bố C++ execution an toàn production.
