# DSA FlowLab: Trạng thái kiểm toán P0 Round 3

**Cập nhật:** 21/10/2026
**Nhánh:** `dev/flowlab-p0`
**Commit nền có CI lỗi:** `3dde96678beb195073edc5eca8e133d4acaea4a6`
**Quyết định hiện tại:** **NO-GO — chờ xác minh lại trên GitHub Actions Windows và Linux**

## 1. Bằng chứng đã xác minh

| Nguồn | Kết quả | Phạm vi |
|---|---|---|
| GitHub Actions run [39438217969](https://github.com/Phuchello/DSA/actions/runs/39438217969) | Linux **PASS**; Windows **FAIL** | Windows thất bại MI-09 và MI-14 tại commit `3dde966`; 15/17 bất biến còn lại PASS. |
| Local Windows, `g++ 16.1.0`, GDB `17.2`, Node `24.19.0` | **48/48 test case PASS** trên lần chạy đầy đủ gần nhất | 12 baseline, 8 normalizer, 17 memory invariants, 11 client test chạy một lần qua MI-12. Đây không phải kết quả của GitHub CI. |
| Golden trace local | **161 snapshot**, đạt các assertion về độ đầy đủ | 7 allocation, 21 pointer traversal, 3 lần unlink, 2 deallocation, 17 call và 18 return. Không có assertion buộc số snapshot phải cố định. |
| MI-14 local có debug | `flag=0`: stdout `77`, `n=valid`; `flag=1`: stdout `-1`, deallocation hoàn tất trước snapshot kế tiếp | Debug ghi symbol `_ZdlPv`, PC, `RCX`, candidate address, NODE generation, call stack và vị trí source. Vector cleanup được ghi nhận là STL event và bị bỏ qua. |
| MI-09 local | PASS | Snapshot sâu nhất chứa `main` và bốn `SumList` frame, mỗi frame giữ tham số `p`, source location, depth, cùng liên kết caller/child. |

## 2. Xử lý MI-14 — theo dõi giải phóng bộ nhớ

Lỗi cũ gắn sự kiện deallocation với một địa chỉ số đã từng thấy. Breakpoint dùng ABI suy ra từ Python host, cài song song tên symbol demangled và mangled, lưu địa chỉ trong tập lịch sử không có generation, rồi xem việc vào `operator delete` như đủ bằng chứng giải phóng. Cách này có thể ghép nhầm event runtime hoặc giá trị thanh ghi với NODE.

Tracer hiện nhận ABI từ compiler target (`RCX` cho Windows x64, `RDI` cho System V x64), chỉ đăng ký các symbol mangled GCC, yêu cầu candidate khớp một NODE allocation đang sống và đúng generation, loại event có frame runtime/STL trung gian, rồi dùng `FinishBreakpoint` để xác nhận deallocator đã return. Chỉ sau đó event mới được commit ở snapshot trước statement kế tiếp. Candidate không đủ bằng chứng không được đánh dấu `freed`.

Bật chẩn đoán bằng `FLOWLAB_DEBUG_DEALLOC=1`. Mỗi event ghi symbol breakpoint, call stack, PC, candidate address, allocation identity và vị trí source thực thi. MI-14 bổ sung regression cho alias và bộ nhớ STL.

## 3. Xử lý MI-09 — stack đệ quy

Run lỗi Round 3 chỉ ghi assertion tổng hợp và không lưu frame thô, vì vậy không thể xác định frame nào bị mất trong run đó. Tracer hiện chỉ đưa frame có source xác nhận thuộc `source.cpp` vào stack; mỗi frame giữ tên hàm, vị trí source, độ sâu, giá trị tham số, frame ID và liên kết parent/child. `line` được đọc theo từng frame, tham số được lưu riêng cho từng invocation, và timeline ghi sự kiện call/return khi độ sâu thay đổi.

MI-09 kiểm tra ít nhất ba invocation `SumList` đồng thời, đúng giá trị `p` theo từng lần gọi, thứ tự frame, liên kết caller/child và các chuyển tiếp call/return. Xác nhận trên Windows CI mới vẫn đang chờ.

## 4. Độ đầy đủ trace và số liệu test

Windows CI cũ dùng GCC `15.2.0` và GDB `17.1`; máy local dùng GCC `16.1.0` và GDB `17.2`. Golden trace tương ứng lần lượt là 29 và 161 snapshot. Bằng chứng hiện có cho thấy số lượng snapshot phụ thuộc toolchain và line stepping; nguyên nhân cụ thể chưa được cô lập hoàn toàn. CI cũ chưa có assertion ngữ nghĩa về trace completeness.

Golden test hiện kiểm tra allocation/initialization, `pHead`/`pTail`, traversal, unlink, before/after delete, call/return và các thay đổi nhìn thấy được. Số snapshot chỉ được ghi nhận để chẩn đoán, không dùng làm ngưỡng PASS.

Một lần chạy `npm test` tại local hiện thực thi 48 test case/48 case duy nhất; MI-12 chạy 11 client test đúng một lần trong command này. Toàn bộ hai job CI thực thi 67 case: Windows chạy 48 case, Linux chạy lại 11 client và 8 normalizer case; số case duy nhất là 48. Tài liệu không cộng các lượt chạy lặp thành test case mới.

## 5. Trạng thái bàn giao

Kết quả local hiện xác nhận các sửa đổi, nhưng chưa thay thế bằng chứng CI Windows bắt buộc. Không dùng trạng thái GO cho đến khi commit mới chạy xanh cả Linux lẫn Windows và log mới xác nhận MI-09, MI-14 cùng trace completeness. Không có tuyên bố triển khai an toàn cho mã C++ tùy ý.
