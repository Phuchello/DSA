# DSA FlowLab: Technical Architecture

## 1. System Overview

DSA FlowLab is an educational runtime visualizer for C++ data structures and algorithms. It translates real C++ code execution into a step-by-step observable state sequence, with a specific focus on Singly Linked Lists and pointer memory semantics.

```text
+-------------------------------------------------------------+
|                      Browser Frontend                       |
|  - React 18 + TypeScript + Vite + Tailwind CSS               |
|  - Monaco / CodeMirror Editor with C++ Syntax Highlighting  |
|  - Dynamic Singly Linked List SVG/DOM Canvas (FLIP anim)   |
|  - Memory & Stack Frames Inspector                          |
|  - Step-by-Step Educational Timeline & Vietnamese Tutor     |
+-------------------------------------------------------------+
                               |
                   HTTP POST /api/run { code, stdin }
                               v
+-------------------------------------------------------------+
|                     Backend Orchestrator                    |
|  - Node.js + Express + TypeScript                           |
|  - Input Validation & Resource Quotas Enforcement           |
|  - Execution Sandbox & Process Manager                      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                  C++ Native Execution Engine                |
|  - g++ Compiler (-std=c++11, -g3, -O0, no frame omission)   |
|  - Interactive GDB/MI + Python Memory Inspector             |
|  - Stdin redirection & Stdout stream capture                |
|  - Allocation / Deallocation tracking (new/delete lifecycle)|
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|              DSA Normalization & Learning Layer             |
|  - ProgramTrace Schema Validator (Zod)                      |
|  - Stable Node Identity & Pointer Topology Graph Builder    |
|  - State Diff Engine (Variable changes, Dereference deltas) |
|  - Vietnamese Pedagogical Explanation Synthesizer           |
+-------------------------------------------------------------+
```

## 2. Key Subsystems

### 2.1 C++ Execution Engine
Unlike purely browser-based interpreters that implement only a subset of C++ and often miss subtle compiler/pointer semantics, DSA FlowLab runs a **real C++ compilation and debug tracing pipeline**:
1. Code and `stdin` are securely staged into an ephemeral temporary workspace.
2. Code is compiled using standard `g++` with full symbol generation (`-g3 -O0`).
3. An automated GDB Python agent attaches to the execution thread, setting breakpoints, stepping through statements, and capturing:
   - Call stack frames (`frameId`, `funcName`, `line`).
   - Local variables (`name`, `type`, `raw_value`, `address`).
   - Dereferenced pointer targets and heap structures (`NODE`, `LIST`).
   - Program output (`stdout`) synchronized to the exact statement line.
4. Execution halts immediately if max steps (1000) or execution timeout (5s) are exceeded.

### 2.2 DSA State Normalizer
Raw debugger outputs are normalized into deterministic `LearningSnapshot` records:
- **Node Graph Extraction**: Recursively discovers all `NODE` instances in heap/stack memory, mapping their `info` and `pNext` pointers.
- **Pointer Status Analysis**: Categorizes each pointer variable (`pHead`, `pTail`, `p`, `prev`, `temp`) into:
  - `valid`: pointing to an active, allocated node.
  - `null`: explicitly `nullptr` / `0x0`.
  - `freed`: pointing to a memory block that was deleted.
  - `dangling`: pointing to an unallocated or invalid memory location.
  - `uninitialized`: local pointer not yet assigned.
- **Topology Diffing**: Compares step $N-1$ and step $N$ to detect:
  - New allocations (`new NODE`).
  - Pointer redirection (`prev->pNext = p->pNext`).
  - Head/Tail shifts (`L.pHead = p`).
  - Memory deallocations (`delete temp`).

### 2.3 Frontend Visualizer
- **Singly Linked List Diagram**: High-fidelity visual cards for each node displaying its value, memory address, and SVG pointer arrow to `pNext`.
- **Pointer Badges**: Badges for `pHead`, `pTail`, `p`, `prev`, `temp` hover above or point directly to the exact node they reference.
- **Vietnamese Pedagogical Tutor**: Real-time contextual narrative explaining *what* happened in this line and *why* it matters for algorithm correctness.

## 3. Data Flow Specification

`POST /api/run` Request:
```json
{
  "code": "string",
  "stdin": "string"
}
```

Response:
```json
{
  "success": true,
  "code": "string",
  "trace": [
    {
      "step": 0,
      "line": 35,
      "funcName": "main",
      "event": "stepLine",
      "stdout": "",
      "stackToRender": [...],
      "heap": {...},
      "dsa": {
        "nodes": [...],
        "pointers": [...],
        "explanation": "..."
      }
    }
  ],
  "buildOutput": ""
}
```
