# DSA FlowLab — Bàn giao audit PR #1

PR: [#1](https://github.com/Phuchello/DSA/pull/1), vẫn mở và chưa merge.  
Code candidate đã kiểm thử: [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed).  
CI: [run 39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961): Linux job [119245616617](https://github.com/Phuchello/DSA/actions/runs/39606982961/job/119245616617) và Windows/native/Chrome job [119246143017](https://github.com/Phuchello/DSA/actions/runs/39606982961/job/119246143017) PASS.  
Artifact: [browser-smoke-evidence 12348299743](https://github.com/Phuchello/DSA/actions/runs/39606982961/artifacts/12348299743), 255,489 bytes, SHA-256 `0048a878be7b7abe5c4d3ba4f0ef2c21439d55e789c2cfd70dcd75296180d427`, expires 04/11/2026 13:24:07 UTC.

## Review fixes and evidence

1. **Process-tree termination:** POSIX uses a detached process group with bounded TERM/KILL escalation. Windows snapshots process identity through Toolhelp, terminates the captured tree, verifies process creation identities, and shares one compiled native verifier assembly across concurrent timeouts. The taskkill failure fallback and explicitly unverified path are covered. MI-18 passed on both CI platforms; focused Windows process-tree run was 9/9 locally.
2. **Pointer identity per frame:** stable identities include frame context. Recursion frames retain separate `p`; caller and `CreateNode` local `p` remain distinct. Normalizer and native GDB MI-20 passed.
3. **Abnormal termination:** crash, interruption, timeout and truncation retain termination status/reason and partial trace. MI-17/21 and frontend tests passed; incomplete runs are not displayed as successful completion.
4. **Stack versus heap NODE:** exact GDB-observed allocator return addresses establish heap allocations; stack addresses remain stack and unproven escaped addresses remain unknown. MI-19/23 passed.
5. **Multiple roots and wording:** separate LIST roots and their pointer topology remain independent (MI-22); canvas relationship wording is corrected and Vietnamese remains default.

## Verification summary

Each CI OS reports 17 baseline + 11 normalizer + 21 memory invariants + 25 client assertions via MI-12 = **74/74 unique assertions**. Chrome 155.0.8059.40 smoke used the real loopback application and native backend: edit/paste, stdin/stdout, timeline, topology/pointers, Vietnamese modes and stale-response guard passed with no console errors. Logs, JSON, trace and screenshots are retained in the artifact.

## Handoff decision

Recommend **NO-GO to merge until reviewers inspect the latest replies and explicitly approve**. All four review threads remain unresolved. No main update, merge, tag, GitHub Release, public deployment or runner publication was performed. The runner uses host privileges and is not suitable for untrusted public execution without OS-level isolation.
