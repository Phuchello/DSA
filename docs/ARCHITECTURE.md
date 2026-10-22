# DSA FlowLab: Technical Architecture

## 1. System Overview

DSA FlowLab is an educational runtime visualizer for C++ data structures and algorithms. It translates real C++ code execution into a step-by-step observable state sequence, with a specific focus on Singly Linked Lists and pointer memory semantics.

```text
+-------------------------------------------------------------+
|                      Browser Frontend                       |
|  - React 18 + TypeScript + Vite + Tailwind CSS               |
|  - Real Editable CodeMirror 6 C++ Editor (Syntax, Line Deco) |
|  - Dynamic Singly Linked List Topological Canvas             |
|  - Memory & Stack Frames Inspector (Advanced Mode)           |
|  - Step-by-Step Educational Timeline & Vietnamese Tutor     |
+-------------------------------------------------------------+
                               |
                   HTTP POST /api/run { code, stdin }
                               v
+-------------------------------------------------------------+
|                     Backend Orchestrator                    |
|  - Node.js + Express + TypeScript (Strict Localhost Binding) |
|  - Request Limits (1MB Payload, 50k Code, 20k Stdin)        |
|  - Concurrency Limiter (Max 8 Concurrent Executions)        |
|  - Ephemeral Workspace Manager (~/.dsa_flowlab_tmp)         |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                  C++ Native Execution Engine                |
|  - g++ Compiler (-std=c++11, -g3, -O0, no frame omission)   |
|  - Automated GDB/MI + Python Memory Inspector (tracer.py)   |
|  - Explicit Before-Statement Snapshot Convention            |
|  - Runtime Deallocation Commitment (Pre vs Post Delete)     |
|  - Termination Classification (Normal, Crashed, Truncated)  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|              DSA Normalization & Learning Layer             |
|  - ProgramTrace Schema Validator (Zod Schema Validation)    |
|  - Multi-Root Reachability Analysis (pHead + Stack Roots)    |
|  - Node Categorization: Allocated, Detached, Unreachable    |
|  - Pointer Classification: Valid, Null, Freed, Dangling      |
|  - Stable Node Identity & Address Reuse (Generation Counter)|
|  - Contextual Vietnamese Pedagogical Narrative Synthesizer   |
+-------------------------------------------------------------+
```

## 2. Key Subsystems & Design Principles

### 2.1 Real C++ Code Editor (CodeMirror 6)
- **Editable Source**: Full editing, typing, copy/pasting, and indentation support.
- **Language Support**: Official `@codemirror/lang-cpp` extension providing C++ keyword, type, and operator highlighting.
- **Execution Line Decoration**: Custom CodeMirror decoration extension that highlights the active execution line with visual borders and scroll-into-view.
- **Stale Trace Safety**: Modifying source code or `stdin` raises the `isTraceStale` state. An amber warning banner alerts the student that the existing trace reflects prior code and requires re-running, preventing any presentation of an outdated trace as matching edited source code.
- **Integrated Stdin Tab**: Allows user-defined standard input for `cin` operations with a visual pulse indicator.

### 2.2 Execution Snapshot Convention (Before-Statement)
DSA FlowLab follows an explicit **Before-Statement Snapshot Convention**:
- **Line Indicator**: Highlights line $L$ as the statement *about to be executed*.
- **Memory Snapshot**: Captures the state of stack frames, variables, and heap allocations *immediately prior* to evaluating line $L$.
- **Deallocation Semantics**:
  - When paused at `delete temp;`, `temp` and its target memory block are strictly preserved as active (`allocated` or `detached`).
  - Upon advancing to the next step, the deallocation is committed: the address is added to `deletedAddresses`, the block is classified as `freed`, and any pointer retaining that address without reassignment is marked as pointing to freed memory (`freed` / dangling).
- **Termination Classification**: Distinguishes normal termination (`return`, exit code 0) from crashes (`SIGSEGV`, `SIGABRT`), timeouts, and step ceiling limits (`truncated`), rather than labeling all execution endings as normal return.

### 2.3 Topological Pointer Graph & Reachability
Instead of drawing linear arrows between consecutive displayed elements, the normalizer and visualizer reconstruct the true pointer topology:
- **Real Pointer Edges**: Directed connections (`pNext ➔`) are drawn exclusively between a node and the specific address stored in its `pNext` field.
- **Multi-Root Reachability**:
  - Traversal starts from all active stack roots (`pHead`, `pTail`, `p`, `prev`, `temp`, and arguments/locals).
  - **Main List Chain (`allocated`)**: Nodes reachable from `pHead` following `pNext` chains.
  - **Detached Nodes (`detached`)**: Nodes unlinked from the main chain but still reachable from an active stack pointer (e.g., node held by `temp` during removal).
  - **Unreachable Nodes (`unreachable`)**: Active heap blocks no longer reachable from any stack root (potential memory leak).
  - **Freed Blocks (`freed`)**: Deallocated memory blocks retained for educational inspection with strikethrough formatting and dangling pointer indicators.
- **Address Reuse & Object Identity**: Allocations reusing a recently freed memory address increment an allocation generation counter (`node_0x..._gen2`), ensuring stable React DOM keys and preventing visual animation artifacts.

### 2.4 Execution Security Architecture
- **Local Remediated Runner**: The current engine is designed exclusively for local execution on the student's machine. The backend strictly binds to `127.0.0.1` by default.
- **Guards & Limits**:
  - Request body limit: 1 MB.
  - Source code limit: 50,000 characters.
  - Stdin limit: 20,000 characters.
  - Concurrency control: Maximum 8 concurrent compilation/tracing executions.
  - Process ownership: POSIX commands use detached process groups; Windows targets enter a Job Object during process creation. Unverified cleanup retains the slot and workspace.
- **Truth in Security**: Static pattern checking (blocking `#include <windows.h>`, `system()`) is a supplementary sanity check, NOT a secure execution sandbox. Host g++ and GDB execution must never be exposed to public, untrusted networks.
- **Future Production Isolation Architecture**: For future online deployments, the execution worker will run in ephemeral, unprivileged Linux microVMs or containers (e.g. gVisor, Firecracker, or isolated seccomp-bpf sandbox) without network access, without Docker socket mounts, and with strict CPU, RAM, and PID quotas.

## 3. Windows Process Ownership and Termination

The Windows runner builds a small native launcher with the same MinGW toolchain already required for C++ execution. It creates a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, configures `PROC_THREAD_ATTRIBUTE_JOB_LIST` on `STARTUPINFOEX`, and creates the target suspended. The target belongs to the Job before its first instruction; the launcher resumes it only after capturing process identity. The explicit handle list passes only target stdin/stdout/stderr, not the Job handle.

Timeout termination calls `TerminateJobObject`, then verifies `QueryInformationJobObject` reports zero active processes (3.5-second bound). Node waits for the supervisor up to 6 seconds. After the root exits normally, the launcher allows a separate natural descendant drain of at most 500 ms while checking the stop/timeout event; this handles a short root/child scheduler race without hiding a timeout. If Job members remain at that bound, it force-terminates them and does not report normal completion. If final ownership status is missing or unverified, the supervisor is terminated so closing its sole Job handle asks Windows to terminate members; Node still returns interrupted/unverified and retains the workspace and concurrency slot. This prevents false success and avoids deleting files while processes may still use them.

`PROC_THREAD_ATTRIBUTE_JOB_LIST` requires Windows 10+ or Windows Server 2016+. A parent Job may reject nested assignment; that failure is closed before the target starts. Ordinary descendants inherit Job membership unless a parent Job policy permits breakaway. This lifecycle mechanism is not a security sandbox and does not make arbitrary host code safe. See [Microsoft UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute) and [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
