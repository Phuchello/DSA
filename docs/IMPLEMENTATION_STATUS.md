# DSA FlowLab: Trạng thái audit chất lượng P0

Code candidate: [6a5430a0e538c0b4a3c54d360844d149ae0166a5](https://github.com/Phuchello/DSA/commit/6a5430a0e538c0b4a3c54d360844d149ae0166a5)  
GitHub Actions: [run 39586265810](https://github.com/Phuchello/DSA/actions/runs/39586265810) — Linux và Windows/Chrome PASS.  
Browser evidence: [artifact 12340605851](https://github.com/Phuchello/DSA/actions/runs/39586265810/artifacts/12340605851), 253,465 bytes, retention 14 ngày.

## Quality gate
| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| POSIX/Windows process-tree cleanup | PASS | Detached POSIX group, Windows tree kill + root-close wait; timeout, cleanup and concurrency MI-18 on both jobs. |
| Pointer identity theo frame | PASS | Normalizer regressions and native MI-20 recursion GDB trace. |
| Crash/truncation display | PASS | Frontend partial-trace tests, MI-17, native SIGSEGV MI-21. |
| Stack NODE versus heap NODE | PASS | Normalizer classification and mixed-location native MI-19. |
| Linux/POSIX CI | PASS | Builds, 23 Vitest, 10 normalizer, full native suite 69 unique assertions. |
| Windows native CI | PASS | MinGW/GDB and 69/69 unique assertions. |
| Golden/stdout/legacy invariants | PASS | TC-GOLDEN-01, TC-STDOUT-CHRONOLOGY, MI-09 and MI-14. |
| Real Chrome | PASS | Real backend; editor/stdin/stdout, topology, timeline, Vietnamese modes, stale-response guard. |
| Artifact retention | PASS | [12340605851](https://github.com/Phuchello/DSA/actions/runs/39586265810/artifacts/12340605851), expires 04/11/2026 10:44:49 UTC. |

Trace uses before-statement snapshots. Code/stdin snapshots and request IDs associate each result with its request; edits mark previous traces stale. Old responses do not replace the current trace. Buffered stdout remains separate final output. Termination status/reason and partial trace distinguish crash, interruption, truncation and normal completion.

P0 is local education software for a tested subset of C++, focused on linked-list flows. It is not a general C++ debugger and is not safe for untrusted code. Browser smoke is one headless Chrome flow; see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
