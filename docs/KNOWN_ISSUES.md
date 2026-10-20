# DSA FlowLab: Known Issues & Limitations

## 1. Runtime Environment Limitations
- **Docker Desktop on Windows**: Requires Windows GUI and administrative permissions. Handled via native MinGW-w64 GCC and Python-enabled GDB runner fallback as defined in ADR-001.
- **Trace Length Ceiling**: Hard-capped at 1000 execution points to protect browser memory and responsiveness during large loops or recursive calls.

## 2. Pointer & Memory Lifecycle Caveats
- **Dangling Pointer Observation**: A pointer variable on the stack preserves its raw numerical address value after `delete target;`. The visualizer must differentiate between *pointer variable existence* on the stack and *validity of dereferencing* the target block on the heap.
- **Compiler Optimization**: Must always compile with `-O0 -fno-omit-frame-pointer` to prevent register allocation from hiding local variables from the debugger.

---
*Updated on every milestone release.*
