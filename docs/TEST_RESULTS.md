# DSA FlowLab — Kết quả kiểm thử quality gate P0

**Cập nhật:** 21/10/2026  
**Nhánh:** `dev/flowlab-p0`  
**Code commit:** [7b14b049ceda4e388b71d25665c93560b7805f6b](https://github.com/Phuchello/DSA/commit/7b14b049ceda4e388b71d25665c93560b7805f6b)  
**GitHub Actions:** [run 39533219152](https://github.com/Phuchello/DSA/actions/runs/39533219152) — Linux PASS, Windows PASS.

## Automated tests — Windows local

- `npm --prefix client run build`: TypeScript check và Vite build PASS.
- `npm --prefix server run build`: TypeScript build PASS.
- `npm --prefix client test`: **14/14 PASS** trên 4 test files. Gồm edit stdin khi request đang pending, response đến sai thứ tự và nhãn stdout cuối riêng.
- `npm test`: **52/52 assertions PASS** — 13/13 baseline, 8/8 normalizer, 17/17 memory invariants, 14 client assertions qua MI-12.
- `TC-STDOUT-CHRONOLOGY`: **PASS** — snapshot `before-statement` của dòng `cout` không có sentinel từ chính câu đó; API vẫn trả output thật ở `finalStdout`.
- `TC-GOLDEN-01`: **PASS**, 161 snapshot, 7 allocation, 21 traversal, 3 unlink, 2 deallocation, 17 call, 18 return.
- `MI-09`: **PASS**, trace đệ quy giữ main cùng bốn frame `SumList`, tham số `p`, source line và caller/child links.
- `MI-14`: **PASS**, nhánh flag=1 hoàn tất `_ZdlPv` tại `delete n;` với RCX và allocation generation 1; flag=0 không hoàn tất deallocation. Vector cleanup của STL bị bỏ qua.

## Real-browser verification — Chrome local

`npm run test:browser` **PASS** với headless Chrome và app/backend được khởi chạy local trên loopback. Đây là browser integration thật, không phải jsdom:

- Paste sample C++ vào CodeMirror rồi sửa thêm comment; request gửi đúng code đã sửa.
- Sửa stdin và chạy C++; đầu ra hiện `0 8`.
- Bước timeline tiến và lùi; chọn snapshot có chain thật, các node và con trỏ `p`, `pHead`, `pTail`.
- Chuyển Beginner ↔ Advanced; UI tiếng Việt và Advanced memory inspector hiển thị.
- Đổi stdin sau trace đầu: trace cũ được đánh dấu stale. Chạy lại với code không đổi và stdin mới; output thành `7` và stale banner biến mất.
- Cả hai request body được kiểm tra để khớp với code/stdin tương ứng.

## GitHub Actions

Run [39533219152](https://github.com/Phuchello/DSA/actions/runs/39533219152) hoàn tất xanh trên code commit:

- Linux **PASS:** client build/typecheck, 14 Vitest tests, server build, 8 normalizer tests.
- Windows **PASS:** full build và full suite 52/52 assertions — 13/13 baseline, 8/8 normalizer, 17/17 invariants, 14 client assertions qua MI-12. Log xác nhận `TC-STDOUT-CHRONOLOGY`, golden 161 snapshot, MI-09 và MI-14 đều PASS.

Các lượt trước xanh trên commit [8d949035dddd0747bd6455804902fdcc75be2f04](https://github.com/Phuchello/DSA/commit/8d949035dddd0747bd6455804902fdcc75be2f04), nhưng run 39533219152 là lần CI kiểm tra thay đổi mới.

## Giới hạn còn lại

Output cuối chỉ có timing chính xác tới mức tracer quan sát được; dữ liệu được buffer đến khi thoát được gắn nhãn final thay vì gán cho một dòng sớm hơn. Browser smoke dùng Chrome đã cài sẵn và không nằm trong hai workflow CI hiện tại. Native C++ runner vẫn không an toàn cho public multi-tenant; không deploy công khai.
