# DSA FlowLab: Test Results & Verification Evidence

**Ngày kiểm thử:** 20/10/2026  
**Phiên bản:** P0 Independent Audit Remediation  
**Môi trường kiểm nghiệm:** Windows 11, MinGW-w64 GCC 16.1.0, GDB 17.2 (Python 3.9), Node.js v24.19.0  
**Lệnh chạy kiểm thử tự động:** `npm test`  
**Kết quả tổng quan:** **42/42 PASS (100% tỷ lệ thành công trên tất cả các phân hệ)**

---

## 1. Phần 1: 12 Bài Toán Cơ Sở (Baseline Suite)

| Mã kiểm thử | Phân loại | Mục tiêu kiểm thử | Dữ liệu nhập (`stdin`) | Kết quả mong đợi | Kết quả thực tế | Số bước | Trạng thái |
|---|---|---|---|---|---|:---:|:---:|
| **TC-GOLDEN-01** | Bài toán Vàng IT003 | `TimKiemVaXoa` chuẩn (Xóa 3 ở đầu và giữa) | `7\n3 0 8 2 3 4 7\n3` | `0 8 2 4 7` | `0 8 2 4 7` | 161 | **PASS** |
| **TC-EDGE-01** | Ca biên 1 | Không tìm thấy phần tử k trong danh sách | `3\n2 4 7\n3` | `2 4 7` | `2 4 7` | 79 | **PASS** |
| **TC-EDGE-02** | Ca biên 2 | Xóa nút ở đầu danh sách (Head) | `3\n3 0 8\n3` | `0 8` | `0 8` | 80 | **PASS** |
| **TC-EDGE-03** | Ca biên 3 | Xóa nút ở cuối danh sách (Tail) | `3\n0 8 3\n3` | `0 8` | `0 8` | 81 | **PASS** |
| **TC-EDGE-04** | Ca biên 4 | Xóa các nút trùng lặp liên tiếp | `5\n3 3 4 3 3\n3` | `4` | `4` | 124 | **PASS** |
| **TC-EDGE-05** | Ca biên 5 | Xóa toàn bộ danh sách (All match) | `3\n3 3 3\n3` | `-1` | `-1` | 82 | **PASS** |
| **TC-EDGE-06** | Ca biên 6 | Danh sách rỗng ban đầu | `0\n3` | `-1` | `-1` | 19 | **PASS** |
| **TC-EDGE-07** | Ca biên 7 | Danh sách có đúng 1 phần tử (Trùng khớp) | `1\n3\n3` | `-1` | `-1` | 40 | **PASS** |
| **TC-EDGE-08** | Ca biên 8 | Danh sách có đúng 1 phần tử (Không trùng) | `1\n7\n3` | `7` | `7` | 39 | **PASS** |
| **TC-SEC-01** | Bổ trợ bảo mật | Ngăn chặn thư viện hệ thống `#include <windows.h>` | *(Không)* | Chặn thực thi | Chặn an toàn | N/A | **PASS** |
| **TC-SEC-02** | Bổ trợ bảo mật | Ngăn chặn hàm gọi lệnh shell `system("calc")` | *(Không)* | Chặn thực thi | Chặn an toàn | N/A | **PASS** |
| **TC-STDIN-DIFF** | Độc lập đầu vào | Cùng 1 mã nguồn nạp 2 input stdin khác nhau | Input A / Input B | `1 3` và `2 3` | `1 3` và `2 3` | 80 / 80 | **PASS** |

---

## 2. Phần 2: Kiểm Thử Đơn Vị Bộ Chuẩn Hóa & Phân Loại Con Trỏ (Normalizer Unit Tests)

| Bài test đơn vị | Phân loại kiểm tra | Tiêu chí nghiệm thu | Kết quả thực tế | Trạng thái |
|---|---|---|---|:---:|
| **UNIT-PTR-NULL** | Phân loại con trỏ | Địa chỉ `0x0` được gắn nhãn `null` | `state === 'null', targetAddress === null` | **PASS** |
| **UNIT-PTR-VALID** | Phân loại con trỏ | Con trỏ tới khối Heap hoạt động được gắn nhãn `valid` | `state === 'valid', targetAddress === '0x5000'` | **PASS** |
| **UNIT-PTR-FREED** | Phân loại con trỏ | Con trỏ tới ô nhớ đã giải phóng được gắn nhãn `freed` | `state === 'freed'` | **PASS** |
| **UNIT-PTR-DANGLING** | Phân loại con trỏ | Con trỏ tới ô nhớ không tồn tại được gắn nhãn `dangling` | `state === 'dangling'` | **PASS** |
| **UNIT-PTR-UNINIT** | Phân loại con trỏ | Biến con trỏ chưa khởi tạo được gắn nhãn `uninitialized` | `state === 'uninitialized'` | **PASS** |
| **UNIT-REACHABILITY** | Phân tích Reachability | Tách bạch chuỗi chính (`allocated`), nút tách rời (`detached`), nút rò rỉ (`unreachable`), ô nhớ đã giải phóng (`freed`) | Đúng tuyệt đối trên cả 4 trường hợp | **PASS** |
| **UNIT-ADDR-REUSE** | Định danh thế hệ | Khi ô nhớ tái sử dụng, bộ đếm thế hệ tăng (`gen2`) và chuyển trạng thái về `allocated` | `id === 'node_0x100_gen2', status === 'allocated'` | **PASS** |

---

## 3. Phần 3: 12 Bất Biến Bộ Nhớ & Topo Con Trỏ (Memory Invariants Suite)

| Mã kiểm thử | Tên bài kiểm tra bất biến | Bằng chứng kiểm chứng trạng thái bộ nhớ | Trạng thái |
|---|---|---|:---:|
| **MI-01** | Correct `pHead` before and after head deletion | Trước lệnh: `L.pHead` trỏ tới nút `info=10`. Sau lệnh: `L.pHead` trỏ tới nút `info=20`. Địa chỉ thay đổi tương ứng. | **PASS** |
| **MI-02** | Correct `pTail` after tail deletion | Trước lệnh: `L.pTail` trỏ tới nút `info=30`. Sau lệnh: `L.pTail` trỏ tới nút `info=20`, nút mới có `nextAddress === null`. | **PASS** |
| **MI-03** | Correct `pNext` target before/after middle unlinking | Trước unlinking: `prev->pNext` trỏ tới nút 20. Sau unlinking: `prev->pNext` trỏ thẳng tới nút 30, bỏ qua nút 20. | **PASS** |
| **MI-04** | Precise pre-delete versus post-delete memory state | Tại dòng dừng `delete temp;`: địa chỉ `temp` vẫn `allocated`, chưa nằm trong `deletedAddresses`. Bước kế tiếp: đã vào `deletedAddresses`, diff ghi nhận `freedNodes`. | **PASS** |
| **MI-05** | Two aliases pointing to one node | Cả hai con trỏ `p` và `q` cùng lưu giá trị địa chỉ hex giống hệt nhau và trỏ tới cùng struct trên Heap. | **PASS** |
| **MI-06** | Dangling pointer after deallocation | Sau lệnh `delete p;`: con trỏ `p` trên ngăn xếp vẫn lưu địa chỉ cũ, được gắn nhãn `freed` (dangling pointer). | **PASS** |
| **MI-07** | Detached node still reachable through valid pointer | Nút 20 sau khi tách khỏi chuỗi chính được phân loại là `detached` vì con trỏ `p` vẫn giữ nó, không bị đánh nhầm là memory leak. | **PASS** |
| **MI-08** | Memory address reuse | Khi địa chỉ cũ được cấp phát lại cho nút mới, hệ thống nhận diện thế hệ mới (`gen >= 2`) và phục hồi trạng thái `allocated`. | **PASS** |
| **MI-09** | Multiple stack frames and recursion | Trong hàm đệ quy `SumList`, quan sát đồng thời nhiều khung ngăn xếp hoạt động với các tham số `p` độc lập. | **PASS** |
| **MI-10** | Trace truncation and abnormal termination | Vòng lặp dừng an toàn khi chạm ngưỡng số bước tối đa, trạng thái kết thúc báo cáo rõ `truncated`. | **PASS** |
| **MI-11** | Different stdin inputs with unchanged source code | Cùng mã nguồn nạp 2 input stdin khác nhau tạo ra 2 chuỗi vết thực thi và kết quả stdout hoàn toàn độc lập (`30` vs `80`). | **PASS** |
| **MI-12** | Browser editor input, output, and timeline consistency | Thực thi toàn bộ bộ test UI Vitest cho CodeMirror, chuyển tab, dải cảnh báo stale trace và canvas topo. | **PASS** |

---

## 4. Phần 4: Bộ Kiểm Thử Giao Diện & Bản Địa Hóa (Client Vitest Suite)

- `src/components/CodeEditor.test.tsx` (5 tests):
  - Khởi tạo CodeMirror 6, hiển thị tab mã nguồn và tab stdin.
  - Chuyển đổi tab và chỉnh sửa dữ liệu stdin qua `onChangeStdin`.
  - Hiển thị huy hiệu và đánh dấu dòng lệnh đang thực thi (`currentLine`).
  - Hiển thị dải cảnh báo vết thực thi cũ (`isTraceStale`) khi mã nguồn bị sửa đổi.
  - Hiển thị lỗi biên dịch hoặc stdout trong console drawer.
- `src/test/LinkedListCanvas.test.tsx` (4 tests):
  - Hiển thị thông báo khi danh sách rỗng.
  - Chỉ vẽ mũi tên liên kết giữa các nút có `pNext` thật, kết thúc bằng thẻ `nullptr (0x0)`.
  - Phân tách riêng biệt các khu vực: Chuỗi chính, Nút tách rời, Ô nhớ đã giải phóng.
  - Hiển thị dock con trỏ đặc biệt (`nullptr`, `uninitialized`, `dangling`).
- `src/test/localization.test.tsx` (2 tests):
  - Chuyển đổi độ khó thành Tiếng Việt (`[Cơ bản]`, `[Nâng cao]`), loại bỏ hoàn toàn chuỗi tiếng Anh rò rỉ.
  - Hiển thị đúng nhãn chế độ Tiếng Việt (`Sư phạm IT003 (Tập sự)` và `Góc nhìn Chuyên sâu`).
