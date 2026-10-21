# DSA FlowLab — Bàn giao kiểm toán chất lượng P0

**Ngày:** 21/10/2026  
**Repository:** [Phuchello/DSA](https://github.com/Phuchello/DSA)  
**Nhánh:** `dev/flowlab-p0`  
**Implementation commit:** [a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec](https://github.com/Phuchello/DSA/commit/a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec)  
**CI run:** [39540945050](https://github.com/Phuchello/DSA/actions/runs/39540945050) — Linux, Windows native tests, and real Chrome PASS.

## Trạng thái

Runtime P0 đã được sửa và kiểm thử local; Linux và Windows + Chrome jobs đều PASS trên implementation commit. Không merge vào `main` và không triển khai native C++ runner công khai.

## Các sửa lỗi P0

- Snapshot giữ quy ước `before-statement`. Tracer không chép stdout cuối ngược lên các bước trước; stdout được quan sát ở bước nào thì ở snapshot đó. Output còn trong buffer khi chương trình thoát được đưa riêng vào `finalStdout` và UI ghi nhãn là đầu ra cuối cùng.
- Mỗi yêu cầu chạy lưu bản chụp bất biến của code và stdin. Trace chỉ được nhận nếu request ID mới nhất và cả hai đầu vào hiện tại vẫn khớp với bản chụp. Trace giữ nguồn đầu vào để trạng thái cũ được tính tự động; phản hồi cũ hoặc đến sai thứ tự không thể ghi đè kết quả mới.
- Thêm regression test cho `cout` trước thời điểm chạy, chỉnh stdin trong lúc chờ, và phản hồi chạy đến sai thứ tự.
- Thêm browser smoke tự động qua Chrome CDP để chạy luồng UI thật trên loopback; workflow Windows lưu log, JSON evidence, response trace và screenshots thành artifact.

## Bằng chứng

- **Automated tests local:** Windows full suite PASS, 52/52 assertions: 13/13 baseline (gồm `TC-STDOUT-CHRONOLOGY`), 8/8 normalizer, 17/17 memory invariants và 14 client assertions. Client build/type-check và server build đều PASS.
- **Real-browser verification:** local Chrome 155.0.8059.85 and CI Chrome 155.0.8059.40 PASS against the real C++/GDB backend. The smoke pastes/edits C++, runs stdin `3\n3 0 8\n3` to stdout `0 8`, navigates both timeline directions, inspects allocated nodes plus `p`, `pHead`, `pTail`, and switches Vietnamese Beginner/Advanced modes. It pauses a genuine response containing stdout `7`, edits stdin to `8` while the UI request is pending, confirms the old response leaves the trace stale, then runs the matching input and sees `8` with the stale marker cleared.
- **GitHub Actions:** run [39540945050](https://github.com/Phuchello/DSA/actions/runs/39540945050) — Linux PASS; Windows native suite 52/52 PASS; real Chrome PASS. Evidence is retained in [artifact 12318909653](https://github.com/Phuchello/DSA/actions/runs/39540945050/artifacts/12318909653) through 2026-11-04.
- **Retry record:** run [39540508595](https://github.com/Phuchello/DSA/actions/runs/39540508595) caught an overly early topology-step selection in the smoke harness. The selection now requires all topology pointers in one snapshot; run 39540945050 verifies that stricter condition.

## Rủi ro còn lại

Runner vẫn biên dịch và chạy mã C++ trên host bằng g++/gdb. Lọc tĩnh, timeout và giới hạn đồng thời không phải sandbox an toàn cho multi-tenant; không đưa runner ra public cho đến khi có cô lập tiến trình mức OS hoặc microVM. Với stdout bị buffer đến lúc thoát, thời điểm chính xác trong trace không xác định; UI vì thế trình bày nó như đầu ra cuối cùng riêng.

## Quyết định bàn giao

P0 runtime and browser release-readiness checks pass for `dev/flowlab-p0`. Linux tests, Windows native C++/GDB tests, and the real-browser smoke all pass in CI. This does not approve merging or public deployment; the runner still lacks an OS-level sandbox for untrusted multi-tenant execution.

