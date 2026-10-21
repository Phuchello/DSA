# DSA FlowLab — Kết quả kiểm thử quality gate P0

**Cập nhật:** 21/10/2026  
**Nhánh:** `dev/flowlab-p0`  
**Implementation commit:** [a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec](https://github.com/Phuchello/DSA/commit/a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec)  
**GitHub Actions:** [run 39540945050](https://github.com/Phuchello/DSA/actions/runs/39540945050) — Linux PASS, Windows + real Chrome PASS.

## Automated tests — Windows local

- `npm --prefix client run build`: TypeScript check và Vite build PASS.
- `npm --prefix server run build`: TypeScript build PASS.
- `npm --prefix client test`: **14/14 PASS** trên 4 test files. Gồm edit stdin khi request đang pending, response đến sai thứ tự và nhãn stdout cuối riêng.
- `npm test`: **52/52 assertions PASS** — 13/13 baseline, 8/8 normalizer, 17/17 memory invariants, 14 client assertions qua MI-12.
- `TC-STDOUT-CHRONOLOGY`: **PASS** — snapshot `before-statement` của dòng `cout` không có sentinel từ chính câu đó; API vẫn trả output thật ở `finalStdout`.
- `TC-GOLDEN-01`: **PASS**, 161 snapshot, 7 allocation, 21 traversal, 3 unlink, 2 deallocation, 17 call, 18 return.
- `MI-09`: **PASS**, trace đệ quy giữ main cùng bốn frame `SumList`, tham số `p`, source line và caller/child links.
- `MI-14`: **PASS**, nhánh flag=1 hoàn tất `_ZdlPv` tại `delete n;` với RCX và allocation generation 1; flag=0 không hoàn tất deallocation. Vector cleanup của STL bị bỏ qua.

## Real-browser verification — Chrome local and CI

`npm run test:browser` **PASS** locally with Chrome 155.0.8059.85, and in CI with Chrome 155.0.8059.40 on `windows-latest`. Both runs use headless Chrome and start the real app plus the C++/GDB backend on loopback; `/api/run` is not mocked:

- Paste and edit C++ in CodeMirror; the captured `/api/run` request body contains that source and the edited stdin.
- Run native C++ with stdin `3\n3 0 8\n3`; actual stdout is `0 8`.
- Move the timeline forward and backward, then inspect a snapshot with allocated nodes plus `pHead`, `pTail`, and `p`.
- Switch from Vietnamese Beginner mode to Advanced memory inspection and back.
- For a deterministic pending-request race, Chrome pauses the **real backend response** after execution. While the request is still pending in the UI, change stdin from `1\n7\n3` to `1\n8\n3`. The returned old response contains stdout `7`, is ignored, and leaves the stale marker visible. The matching third request produces `8` and clears the marker.
- Verify all three request bodies and result ownership; the browser console has no runtime exceptions or errors.

CI artifact [browser-smoke-evidence-39540945050-1](https://github.com/Phuchello/DSA/actions/runs/39540945050/artifacts/12318909653) (artifact ID `12318909653`, 253,092 bytes, expires 2026-11-04) contains the structured evidence JSON, browser/server/Vite logs, first real response trace, and four screenshots: topology, Advanced view, pending stale trace, and current matching trace.

## GitHub Actions

Run [39540945050](https://github.com/Phuchello/DSA/actions/runs/39540945050) completed green on implementation commit [a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec](https://github.com/Phuchello/DSA/commit/a3ade7e6e414ce36a2799ffdbb7a31d376d3f2ec):

- Linux **PASS:** client build/typecheck, 14 Vitest tests, server build, 8 normalizer tests.
- Windows **PASS:** full build; 52/52 assertions — 13/13 baseline, 8/8 normalizer, 17/17 invariants, 14 client assertions via MI-12. `TC-STDOUT-CHRONOLOGY`, 161-snapshot golden trace, MI-09, and MI-14 all PASS.
- Real Chrome smoke **PASS** in the same Windows job, using hosted Chrome and the MSYS2 MinGW g++/GDB toolchain. The evidence artifact above was uploaded successfully.

The preceding CI attempt [39540508595](https://github.com/Phuchello/DSA/actions/runs/39540508595) passed Linux and Windows automated tests but exposed a browser-test selection issue: the first allocated-nodes/head/tail snapshot did not yet contain traversal pointer `p`. The harness was corrected to select one snapshot containing all required elements and now preserves the full response trace; assertions were not relaxed. Run 39540945050 is the green retry.

## Giới hạn còn lại

Output cuối chỉ có timing chính xác tới mức tracer quan sát được; dữ liệu được buffer đến khi thoát được gắn nhãn final thay vì gán cho một dòng sớm hơn. Browser smoke chạy headless trên một bài linked-list golden flow và không thay thế kiểm thử tương tác nhiều thiết bị/trình duyệt. Chrome version đến từ hosted runner và được ghi vào artifact, không pin version. Native C++ runner vẫn không an toàn cho public multi-tenant; không deploy công khai.

