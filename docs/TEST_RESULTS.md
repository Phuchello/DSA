# DSA FlowLab — Kết quả kiểm thử review remediation P0

Cập nhật: 21/10/2026  
Code candidate đã xác minh: [46181df225f664049ed9e179afc968fca111c898](https://github.com/Phuchello/DSA/commit/46181df225f664049ed9e179afc968fca111c898) trên dev/flowlab-p0.  
GitHub Actions: [PR run 39588187541](https://github.com/Phuchello/DSA/actions/runs/39588187541) — Linux/POSIX PASS và Windows + real Chrome PASS trên cùng SHA.  
Jobs: Linux [119182225517](https://github.com/Phuchello/DSA/actions/runs/39588187541/job/119182225517); Windows [119182611866](https://github.com/Phuchello/DSA/actions/runs/39588187541/job/119182611866).  
Browser artifact: [12340063249](https://github.com/Phuchello/DSA/actions/runs/39588187541/artifacts/12340063249), 253,530 bytes; hết hạn 04/11/2026 10:59:21 UTC.

## Kiểm thử tự động — CI

### Linux/POSIX
- Client build/type-check: PASS.
- Vitest: 23 tests, 4 files PASS.
- Server TypeScript build: PASS.
- DSA normalizer/pointer classification: 10/10 PASS.
- Full native g++/GDB and process-tree suite: 15/15 baseline, 10/10 normalizer, 21/21 memory invariants, 23 client assertions through MI-12; 69 unique assertions PASS.
- TC-GOLDEN-01, TC-STDOUT-CHRONOLOGY, MI-09, MI-14, MI-18–MI-21: PASS. Golden trace reported 162 snapshots, 7 allocations, 21 traversals, 3 unlinks, 2 deallocations, 17 calls and 18 returns.

### Windows native C++/GDB
- MSYS2 MinGW-w64 g++, GDB/Python integration and server/client builds: PASS.
- Full automated suite: 69/69 unique assertions PASS: 15 baseline, 10 normalizer, 21 memory invariants and 23 client assertions through MI-12.
- MI-18 timeout/process-tree termination, workspace cleanup and concurrency recovery: PASS.
- MI-19 stack NODE versus heap NODE and links: PASS.
- MI-20 same-named pointers in caller/recursive GDB frames: PASS.
- MI-21 segmentation fault, abnormal termination and partial trace: PASS.
- TC-STDOUT-CHRONOLOGY, MI-09, MI-14 and golden trace: PASS. Golden trace reported 161 snapshots; other reported event counts matched Linux. Platform-specific stepping can differ; tested semantics and topology are the contract, not byte-identical traces.
- Host regressions: localhost accepted (HTTP 200); lookalike hostname rejected (HTTP 403).

The 23 Linux Vitest cases are separate from the 23 frontend assertions exercised inside the full native-suite command; they are not added to the 69 unique assertion count.

**Stability rerun on the same code SHA:** push run [39588182196](https://github.com/Phuchello/DSA/actions/runs/39588182196) also passed Linux, Windows native and real Chrome; MI-18 cleanup passed again. Its separate browser evidence is [artifact 12339928690](https://github.com/Phuchello/DSA/actions/runs/39588182196/artifacts/12339928690) (252,857 bytes; expires 04/11/2026 11:00:34 UTC).

## Real-browser verification — Chrome thật, backend thật

Windows CI launched headless Chrome 155.0.8059.85, the local application and real native g++/GDB backend. The execution API was not mocked. Browser log and artifact confirm:
- Pasted and edited C++ in CodeMirror; the real request included the edit.
- Changed stdin, executed C++ and observed actual stdout 0 8.
- Moved timeline forward and backward.
- Inspected linked-list topology and pHead, pTail and traversal pointers.
- Switched Vietnamese Tập sự / Chuyên sâu modes and inspected memory view.
- Edited stdin while a real request was pending. The old response actually contained stdout 7, but did not replace current trace/output. Rerunning changed input produced stdout 8 and cleared stale state.
- Returned to Vietnamese Beginner mode; no browser runtime exceptions or console errors.

Artifact preserves browser/server/Vite logs, structured JSON evidence, response trace and screenshots. Retention is 14 days.

## Bốn review findings

| Finding | Fix and regression evidence |
|---|---|
| P1 process-tree termination | Detached POSIX process group with bounded termination/escalation; Windows taskkill /T /F waits for the root close event after inherited stdio pipes close. The process-tree fixture also gives descendants inherited stdout/stderr. Promise settlement, cleanup retries and concurrency recovery are tested. Process-tree regression and MI-18 PASS on both jobs. |
| P1 frame-qualified pointer identity | Frame-scoped stable instances preserve recursive p and caller/CreateNode locals. Normalizer regressions and native MI-20 GDB scenario PASS. |
| P2 abnormal termination | Response/UI preserve termination status, reason and partial trace; crash/truncation differ from success. Frontend tests, MI-17 and MI-21 PASS. |
| P2 stack versus heap NODE | Allocation evidence gates heap classification; insufficient evidence remains unknown while true allocation/deallocation and aliases are retained. Normalizer and mixed-location native MI-19 PASS. |

Review replies record evidence; threads remain unresolved until reviewers decide.

## Giới hạn còn lại
- Native runner executes host C++ with current process privileges and is not a sandbox. Keep it local and use trusted source; do not expose publicly or multi-tenant.
- Visualizer covers tested C++ and linked-list states, not general C++ semantics.
- Buffered stdout without a precise observed flush is labeled final output rather than attributed to a source line.
- Browser coverage is headless Chrome on one Windows runner image, one Chrome version per run and one golden flow; it does not replace broader browser/device/visual review.
- Native integration is Linux POSIX plus Windows MinGW/GDB, not every compiler or OS configuration.
- CI artifact expires after 14 days; rerun to recreate evidence after expiry.
