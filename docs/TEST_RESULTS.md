# DSA FlowLab: Test Results & Verification Evidence

**Ngày kiểm thử:** 20/10/2026  
**Môi trường kiểm nghiệm:** Windows 11, MinGW-w64 GCC 16.1.0, GDB 17.2 (hỗ trợ Python), Node.js v24.19.0  
**Lệnh chạy kiểm thử tự động:** `npm test` (`node tests/runAllTests.js`)  
**Kết quả tổng quan:** **12/12 PASS (100% tỷ lệ thành công)**

---

## 1. Bảng Kết Quả Kiểm Thử Chi Tiết

| Mã kiểm thử | Phân loại | Mục tiêu kiểm thử | Dữ liệu nhập (`stdin`) | Kết quả mong đợi | Kết quả thực tế | Số bước thực thi | Trạng thái |
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
| **TC-SEC-01** | Bảo mật mã nguồn | Ngăn chặn thư viện hệ thống `#include <windows.h>` | *(Không)* | Chặn thực thi | Chặn an toàn | N/A | **PASS** |
| **TC-SEC-02** | Bảo mật mã nguồn | Ngăn chặn hàm gọi lệnh shell `system("calc")` | *(Không)* | Chặn thực thi | Chặn an toàn | N/A | **PASS** |
| **TC-STDIN-DIFF** | Độc lập đầu vào | Cùng 1 mã nguồn nạp 2 input stdin khác nhau | Input A / Input B | `1 3` và `2 3` | `1 3` và `2 3` | 80 / 80 | **PASS** |

---

## 2. Bằng chứng Trực quan Hóa Bộ nhớ (Memory Invariant Evidence)

Đối chiếu trên ca kiểm thử vàng `TC-GOLDEN-01` (`[3, 0, 8, 2, 3, 4, 7]`, `k = 3`):
1. **Khởi tạo:** `L.pHead` ban đầu trỏ tới nút `0x...` mang giá trị `3`, `L.pTail` trỏ tới nút cuối mang giá trị `7`.
2. **Lần xóa 1 (Xóa nút đầu):**
   - Con trỏ `temp` trỏ vào nút đầu `3`.
   - `L.pHead` cập nhật trỏ sang nút tiếp theo mang giá trị `0`.
   - Con trỏ `p` di chuyển sang nút `0`.
   - Sau dòng `delete temp;`: địa chỉ bộ nhớ cũ của nút `3` được đưa vào danh sách thu hồi (`freed: true`).
3. **Lần xóa 2 (Xóa nút ở giữa):**
   - Con trỏ `prev` giữ nút `2`.
   - Con trỏ `temp` và `p` trỏ tới nút `3` thứ hai.
   - Thao tác `prev->pNext = p->pNext` bắc cầu bỏ qua nút `3` và liên kết trực tiếp sang nút `4`.
   - Sau dòng `delete temp;`: nút `3` giữa được thu hồi, chuỗi liên kết không bị gián đoạn.
4. **Kết thúc:** `L.pTail` vẫn bảo toàn trỏ vào nút `7` (`pNext == nullptr`), `PrintList` in chính xác `0 8 2 4 7`.

---

## 3. Nhật ký Chạy Test Thực Tế (Raw Test Runner Output)

```text
======================================================================
🚀 DSA FlowLab: Automated Test Suite Execution
======================================================================
Đang chạy [TC-GOLDEN-01] IT003 TimKiemVaXoa chuẩn (Xóa 3 ở đầu và giữa: [3,0,8,2,3,4,7] -> [0,8,2,4,7])... ✅ PASS (Output: "0 8 2 4 7", Steps: 161)
Đang chạy [TC-EDGE-01] Ca biên 1: Không tìm thấy k trong danh sách ([2,4,7], k=3 -> 2 4 7)... ✅ PASS (Output: "2 4 7", Steps: 79)
Đang chạy [TC-EDGE-02] Ca biên 2: Xóa phần tử đầu danh sách ([3,0,8], k=3 -> 0 8)... ✅ PASS (Output: "0 8", Steps: 80)
Đang chạy [TC-EDGE-03] Ca biên 3: Xóa phần tử cuối danh sách ([0,8,3], k=3 -> 0 8)... ✅ PASS (Output: "0 8", Steps: 81)
Đang chạy [TC-EDGE-04] Ca biên 4: Xóa các nút trùng lặp liên tiếp ([3,3,4,3,3], k=3 -> 4)... ✅ PASS (Output: "4", Steps: 124)
Đang chạy [TC-EDGE-05] Ca biên 5: Xóa toàn bộ danh sách ([3,3,3], k=3 -> -1)... ✅ PASS (Output: "-1", Steps: 82)
Đang chạy [TC-EDGE-06] Ca biên 6: Danh sách rỗng ([] -> -1)... ✅ PASS (Output: "-1", Steps: 19)
Đang chạy [TC-EDGE-07] Ca biên 7: Danh sách có đúng 1 phần tử trùng khớp ([3], k=3 -> -1)... ✅ PASS (Output: "-1", Steps: 40)
Đang chạy [TC-EDGE-08] Ca biên 8: Danh sách có đúng 1 phần tử không trùng ([7], k=3 -> 7)... ✅ PASS (Output: "7", Steps: 39)
Đang chạy [TC-SEC-01] Bảo mật: Ngăn chặn mã độc #include <windows.h>... ✅ PASS (Đã chặn an toàn)
Đang chạy [TC-SEC-02] Bảo mật: Ngăn chặn hàm thực thi hệ thống system()... ✅ PASS (Đã chặn an toàn)
Đang chạy [TC-STDIN-DIFF] Kiểm tra tính độc lập của stdin... ✅ PASS (Input A -> "1 3", Input B -> "2 3")
======================================================================
🏁 Tổng kết: 12 PASS, 0 FAIL trên tổng số 12 bài kiểm tra
======================================================================
```
