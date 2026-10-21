# DSA FlowLab — Bàn giao kiểm toán chất lượng P0

**Ngày:** 21/10/2026  
**Repository:** [Phuchello/DSA](https://github.com/Phuchello/DSA)  
**Nhánh:** `dev/flowlab-p0`  
**Code commit:** [7b14b049ceda4e388b71d25665c93560b7805f6b](https://github.com/Phuchello/DSA/commit/7b14b049ceda4e388b71d25665c93560b7805f6b)  
**CI run:** [39533219152](https://github.com/Phuchello/DSA/actions/runs/39533219152) — Linux và Windows PASS.

## Trạng thái

Runtime P0 đã được sửa và kiểm thử local; cả hai job CI đều PASS trên code commit. Không merge vào `main` và không triển khai native C++ runner công khai.

## Các sửa lỗi P0

- Snapshot giữ quy ước `before-statement`. Tracer không chép stdout cuối ngược lên các bước trước; stdout được quan sát ở bước nào thì ở snapshot đó. Output còn trong buffer khi chương trình thoát được đưa riêng vào `finalStdout` và UI ghi nhãn là đầu ra cuối cùng.
- Mỗi yêu cầu chạy lưu bản chụp bất biến của code và stdin. Trace chỉ được nhận nếu request ID mới nhất và cả hai đầu vào hiện tại vẫn khớp với bản chụp. Trace giữ nguồn đầu vào để trạng thái cũ được tính tự động; phản hồi cũ hoặc đến sai thứ tự không thể ghi đè kết quả mới.
- Thêm regression test cho `cout` trước thời điểm chạy, chỉnh stdin trong lúc chờ, và phản hồi chạy đến sai thứ tự.
- Thêm browser smoke tự động qua Chrome CDP để chạy luồng UI thật trên loopback.

## Bằng chứng

- **Automated tests local:** Windows full suite PASS, 52/52 assertions: 13/13 baseline (gồm `TC-STDOUT-CHRONOLOGY`), 8/8 normalizer, 17/17 memory invariants và 14 client assertions. Client build/type-check và server build đều PASS.
- **Real-browser verification local:** `npm run test:browser` PASS trong headless Chrome với backend C++/GDB thật. Dán và sửa code C++, đổi stdin, thấy stdout `0 8` rồi `7`, bước tới/lùi, kiểm tra chain và con trỏ `p`, `pHead`, `pTail`, đổi Beginner/Advanced, và xác nhận trace cũ bị đánh dấu stale rồi được xóa khi chạy đúng input mới.
- **GitHub Actions:** run 39533219152 — Linux PASS; Windows PASS.

## Rủi ro còn lại

Runner vẫn biên dịch và chạy mã C++ trên host bằng g++/gdb. Lọc tĩnh, timeout và giới hạn đồng thời không phải sandbox an toàn cho multi-tenant; không đưa runner ra public cho đến khi có cô lập tiến trình mức OS hoặc microVM. Với stdout bị buffer đến lúc thoát, thời điểm chính xác trong trace không xác định; UI vì thế trình bày nó như đầu ra cuối cùng riêng.

## Quyết định bàn giao

Quality gate P0 runtime correctness đạt. CI chạy sau thay đổi xác nhận Linux build/tests và Windows full suite; browser smoke được xác minh local với Chrome thật. Đây không phải phê duyệt merge hoặc triển khai công khai.
