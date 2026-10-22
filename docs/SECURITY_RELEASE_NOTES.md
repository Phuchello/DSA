# DSA FlowLab — Security Notes (P0 candidate)

Candidate code: [0e518054625133b56ff983f0926a89e49b0f18ed](https://github.com/Phuchello/DSA/commit/0e518054625133b56ff983f0926a89e49b0f18ed). CI [39606982961](https://github.com/Phuchello/DSA/actions/runs/39606982961) passed on Linux and Windows/Chrome.

- Backend binds to `127.0.0.1` by default; CORS uses a local-origin allowlist and exact Host validation. Regression checks passed in the Linux native suite.
- C++ compilation/execution remains host-local. Static source filters, resource limits, loopback, CORS and process-tree cleanup do not isolate arbitrary native code. The runner is **not a sandbox** and is unsuitable for untrusted public or multi-tenant use without OS-level isolation.
- Process-tree termination is bounded and verifies captured Windows process creation identities and POSIX process-group disappearance. If verification fails, the request surfaces an unverified termination error and must not claim cleanup succeeded.
- GDB traces cover the tested C++ subset. Heap NODE classification requires observed allocator-return evidence; ambiguous addresses remain unknown. Buffered output is not backfilled into earlier snapshots.
- Browser smoke is headless Chrome 155.0.8059.40 on one Windows hosted image; it is not a broad browser/device security assessment.

PR #1 remains unmerged. No tag, release, public deployment, or public runner has been created.
