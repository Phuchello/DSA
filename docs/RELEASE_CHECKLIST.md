# DSA FlowLab P0 — Checklist kiểm toán PR

Code candidate đã kiểm thử: [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed).  
Pull request: [#1](https://github.com/Phuchello/DSA/pull/1).  
CI: [run 39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961) — Linux job 119245616617 và Windows/native/Chrome job 119246143017 PASS.  
Browser evidence: [artifact 12348299743](https://github.com/Phuchello/DSA/actions/runs/39606982961/artifacts/12348299743), 255,489 bytes; expires 04/11/2026 13:24:07 UTC.

## Verification

- [x] Linux/POSIX build and full native tests: 74/74 unique assertions PASS.
- [x] Windows MinGW g++/GDB build and full native tests: 74/74 unique assertions PASS.
- [x] Client UI/localization Vitest: 25/25; normalizer: 11/11.
- [x] MI-18 process-tree timeout, cleanup and concurrency recovery; fallback and unverified paths exercised.
- [x] MI-19 stack/heap evidence; MI-20 per-frame pointer identity; MI-21 crash; MI-22 multiple LIST roots; MI-23 allocation evidence.
- [x] Real Chrome with real C++/GDB backend: editor/stdin/stdout, timeline, topology/pointers, Vietnamese Beginner/Advanced, stale-response protection and clean console.
- [x] Browser logs, trace/JSON evidence and screenshots retained in artifact 12348299743.

## Review and release boundary

- [x] Four review findings have focused fixes and regression coverage; replies include final verification evidence.
- [ ] Reviewer re-review/approval of all four threads. Threads remain unresolved for reviewer decision.
- [ ] Human authorization to merge. **Not granted.**
- [ ] Merge, tag, release, deploy or public runner. **Not performed.**

**Decision: NO-GO to merge now.** Candidate is ready for reviewer re-review; native execution remains local-only and is not a sandbox.
