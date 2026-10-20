import gdb
import json
import os
import re
import sys
import time

# Configure GDB parameters
gdb.execute("set pagination off")
gdb.execute("set confirm off")
gdb.execute("set print address on")
gdb.execute("set print pretty off")

try:
    gdb.execute("skip -rfu ^std::")
    gdb.execute("skip -rfu ^__")
    gdb.execute("skip -gfi */include/*")
    gdb.execute("skip -gfi *bits/*")
except Exception:
    pass

TARGET_FILE = os.environ.get("FLOWLAB_TARGET_FILE", "source.cpp")
STDIN_FILE = os.environ.get("FLOWLAB_STDIN_FILE", "")
STDOUT_FILE = os.environ.get("FLOWLAB_STDOUT_FILE", "")
TRACE_FILE = os.environ.get("FLOWLAB_TRACE_FILE", "trace.json")
MAX_STEPS = int(os.environ.get("FLOWLAB_MAX_STEPS", "1000"))

start_cmd = "start"
if STDIN_FILE and os.path.exists(STDIN_FILE) and os.path.getsize(STDIN_FILE) > 0:
    start_cmd += f' < "{STDIN_FILE.replace(chr(92), "/")}"'
if STDOUT_FILE:
    start_cmd += f' > "{STDOUT_FILE.replace(chr(92), "/")}"'

started = False
for attempt in range(40):
    try:
        gdb.execute(start_cmd)
        started = True
        break
    except Exception as e:
        time.sleep(0.3)

if not started:
    for attempt in range(25):
        try:
            gdb.execute("b main")
            gdb.execute(start_cmd.replace("start", "run", 1))
            started = True
            break
        except Exception as e2:
            time.sleep(0.3)
            if attempt == 24:
                with open("gdb_run_error.log", "w", encoding="utf-8") as ef:
                    ef.write(f"run error: {e2}\n")

trace = []
step_count = 0
deleted_addresses = set()
observed_freed_addresses = set()
all_allocated_addresses = set()
source_lines_cache = {}
last_known_node_values = {}  # Cache of last known struct contents before deallocation
pending_allocations = False  # Track when a new/CreateNode statement was executed
last_stdout_size = -1
last_stdout_cache = ""

class DeallocationBreakpoint(gdb.Breakpoint):
    """Runtime debugger-observed deallocation tracker.
    Intercepts calls to operator delete at the CPU register level,
    recording the exact address passed to the deallocator.
    """
    def __init__(self, spec):
        super().__init__(spec, gdb.BP_BREAKPOINT, internal=True)
        self.silent = True

    def stop(self):
        try:
            f = gdb.newest_frame()
            # Determine platform register for first argument (pointer being freed):
            # Windows x64 (MSVC and MinGW-w64 GCC): RCX
            # Linux / macOS x64 (System V AMD64 ABI): RDI
            # Do NOT check RDI on Windows, because RDI is a callee-saved register
            # that retains local variables across calls.
            is_win = (
                os.name == 'nt' or
                sys.platform.startswith('win') or
                sys.platform.startswith('msys') or
                sys.platform.startswith('cygwin')
            )
            reg_name = 'rcx' if is_win else 'rdi'
            try:
                val = int(f.read_register(reg_name))
                if val > 0x1000:
                    addr_hex = f"0x{val:x}"
                    observed_freed_addresses.add(addr_hex)
            except Exception:
                pass
        except Exception:
            pass
        return False

# Register runtime deallocation breakpoints across platforms and compilers
# NOTE: We intercept 'operator delete' and 'operator delete[]', NOT 'free'.
# C 'free' is called internally by CRT/iostream buffers; user C++ NODE allocations
# always invoke 'operator delete'.
for spec in [
    'operator delete(void*, unsigned long long)',
    'operator delete(void*)',
    'operator delete(void*, unsigned long)',
    'operator delete[](void*, unsigned long long)',
    'operator delete[](void*)',
    'operator delete[](void*, unsigned long)',
    '_ZdlPv',      # GCC mangled: operator delete(void*)
    '_ZdaPv',      # GCC mangled: operator delete[](void*)
    '_ZdlPvy',     # GCC mangled: operator delete(void*, unsigned long long)
    '_ZdaPvy',     # GCC mangled: operator delete[](void*, unsigned long long)
    '_ZdlPvm',     # GCC mangled: operator delete(void*, unsigned long)
    '_ZdaPvm',     # GCC mangled: operator delete[](void*, unsigned long)
]:
    try:
        DeallocationBreakpoint(spec)
    except Exception:
        pass

def read_source_line(filename, lineno):
    if filename not in source_lines_cache:
        try:
            if os.path.exists(filename):
                with open(filename, "r", encoding="utf-8", errors="replace") as sf:
                    source_lines_cache[filename] = sf.readlines()
            else:
                source_lines_cache[filename] = []
        except Exception:
            source_lines_cache[filename] = []
    lines = source_lines_cache[filename]
    if 1 <= lineno <= len(lines):
        return lines[lineno - 1].strip()
    return ""

def read_current_stdout():
    global last_stdout_size, last_stdout_cache
    if STDOUT_FILE and os.path.exists(STDOUT_FILE):
        try:
            sz = os.path.getsize(STDOUT_FILE)
            if sz == last_stdout_size:
                return last_stdout_cache
            with open(STDOUT_FILE, "r", encoding="utf-8", errors="replace") as f:
                last_stdout_cache = f.read()
                last_stdout_size = sz
                return last_stdout_cache
        except Exception:
            return last_stdout_cache
    return ""

def parse_val(val):
    """Encodes a gdb.Value into the C_DATA / C_STRUCT / C_ARRAY format."""
    if val is None:
        return ["C_DATA", "0x0", "null", None]
    try:
        if val.is_optimized_out:
            return ["C_DATA", "0x0", "uninitialized", "?"]

        t = val.type.strip_typedefs()
        t_str = str(t)

        # Pointer or reference
        if t.code in (gdb.TYPE_CODE_PTR, gdb.TYPE_CODE_REF):
            try:
                addr_int = int(val)
                hex_target = f"0x{addr_int:x}"
                v_addr = hex(int(val.address)) if val.address else "0x0"
                if addr_int == 0:
                    return ["C_DATA", v_addr, "pointer", "0x0"]
                return ["C_DATA", v_addr, "pointer", hex_target]
            except Exception:
                return ["C_DATA", "0x0", "pointer", "0x0"]

        # Struct
        elif t.code == gdb.TYPE_CODE_STRUCT:
            addr = hex(int(val.address)) if val.address else "0x0"
            struct_data = ["C_STRUCT", addr, t_str]
            for field in t.fields():
                fname = field.name
                if fname is None:
                    continue
                try:
                    fval = val[fname]
                    struct_data.append([fname, parse_val(fval)])
                except Exception:
                    struct_data.append([fname, ["C_DATA", "0x0", "uninitialized", "?"]])
            return struct_data

        # Array
        elif t.code == gdb.TYPE_CODE_ARRAY:
            addr = hex(int(val.address)) if val.address else "0x0"
            arr_data = ["C_ARRAY", addr]
            try:
                r = t.range()
                n = r[1] - r[0] + 1
                for i in range(min(n, 50)):
                    arr_data.append(parse_val(val[i]))
            except Exception:
                pass
            return arr_data

        # Base primitive (int, char, bool, float, etc.)
        else:
            addr = hex(int(val.address)) if val.address else "0x0"
            val_str = str(val)
            try:
                if t_str in ("int", "short", "long", "long long", "unsigned int"):
                    val_clean = int(val_str.split()[0])
                elif t_str in ("float", "double"):
                    val_clean = float(val_str)
                elif t_str == "bool":
                    val_clean = (val_str == "true" or val_str == "1")
                else:
                    val_clean = val_str
            except Exception:
                val_clean = val_str
            return ["C_DATA", addr, t_str, val_clean]
    except Exception as e:
        return ["C_DATA", "0x0", "unknown", str(e)]

def inspect_heap_node(addr_hex):
    """Safely inspects a NODE struct at a given heap address."""
    if not addr_hex or addr_hex == "0x0":
        return None
    try:
        addr_int = int(addr_hex, 16)
        if addr_int < 0x1000:
            return None
        val = gdb.parse_and_eval(f"*(NODE*){addr_hex}")
        parsed = parse_val(val)
        if parsed and parsed[0] == "C_STRUCT":
            last_known_node_values[addr_hex] = parsed
        return parsed
    except Exception:
        return None

termination_status = "normal"
termination_reason = "Chương trình kết thúc bình thường (Exit code 0)"
consecutive_foreign_steps = 0

while step_count < MAX_STEPS:
    step_count += 1
    try:
        frame = gdb.selected_frame()
    except Exception:
        break

    sal = frame.find_sal()
    symtab = sal.symtab
    raw_fname = symtab.filename if symtab and symtab.filename else ""
    filename = os.path.basename(raw_fname)
    line = sal.line
    func_name = frame.name() or ""

    # Check if we are inside user code
    if filename == TARGET_FILE and func_name:
        consecutive_foreign_steps = 0
        code_text = read_source_line(raw_fname, line)

        # -------------------------------------------------------------
        # EXACT BEFORE-STATEMENT SNAPSHOT SEMANTICS:
        # Commit deallocations observed by debugger runtime during previous step
        # -------------------------------------------------------------
        for f_addr in observed_freed_addresses:
            if f_addr in all_allocated_addresses:
                deleted_addresses.add(f_addr)

        # Build stackToRender and discover active pointers
        stack_to_render = []
        heap_records = {}

        # Collect user frames from outermost down to innermost
        cur_f = frame
        f_list = []
        while cur_f:
            try:
                is_user = False
                f_sal = cur_f.find_sal()
                if f_sal and f_sal.symtab and f_sal.symtab.filename:
                    fn = os.path.basename(f_sal.symtab.filename.replace('\\', '/'))
                    if fn == TARGET_FILE:
                        is_user = True
                if not is_user:
                    try:
                        fn_sym = cur_f.function()
                        if fn_sym and fn_sym.symtab and fn_sym.symtab.filename:
                            fn = os.path.basename(fn_sym.symtab.filename.replace('\\', '/'))
                            if fn == TARGET_FILE:
                                is_user = True
                    except Exception:
                        pass
                if not is_user and cur_f.name():
                    fname = cur_f.name()
                    if not fname.startswith('_') and not fname.startswith('std::') and 'CRT' not in fname and 'ntdll' not in fname and 'msvcrt' not in fname and 'kernel' not in fname.lower():
                        is_user = True

                if is_user:
                    f_list.append(cur_f)
            except Exception:
                pass

            try:
                cur_f = cur_f.older()
            except Exception:
                break
        f_list.reverse()

        observed_active_pointers = []

        for idx, f in enumerate(f_list):
            f_name = f.name() or "???"
            try:
                fp = hex(int(f.read_register("sp")))
            except Exception:
                try:
                    fp = hex(int(f.pc()))
                except Exception:
                    fp = f"frame_{idx}"
            locals_dict = {}
            ordered_varnames = []

            try:
                block = f.block()
                while block:
                    for sym in block:
                        if (sym.is_argument or sym.is_variable) and sym.name not in locals_dict:
                            sname = sym.name
                            ordered_varnames.append(sname)
                            try:
                                # For innermost frame, verify if declaration line has been reached
                                if f == frame and hasattr(sym, 'line') and sym.line and sym.line > line and not sym.is_argument:
                                    locals_dict[sname] = ["C_DATA", "0x0", "uninitialized", "?"]
                                    continue
                                val = f.read_var(sym)
                                parsed = parse_val(val)
                                locals_dict[sname] = parsed

                                # Detect NODE pointers
                                t_str = str(val.type.strip_typedefs())
                                if "NODE" in t_str and val.type.code == gdb.TYPE_CODE_PTR:
                                    try:
                                        ptr_val = int(val)
                                        if ptr_val > 0x1000:
                                            p_addr_hex = f"0x{ptr_val:x}"
                                            observed_active_pointers.append((sname, p_addr_hex))
                                            if p_addr_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(p_addr_hex)
                                                if node_val:
                                                    all_allocated_addresses.add(p_addr_hex)
                                                    heap_records[p_addr_hex] = node_val
                                    except Exception:
                                        pass
                                elif "LIST" in t_str:
                                    try:
                                        p_head = val["pHead"]
                                        if int(p_head) > 0x1000:
                                            h_hex = f"0x{int(p_head):x}"
                                            observed_active_pointers.append((f"{sname}.pHead", h_hex))
                                            if h_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(h_hex)
                                                if node_val:
                                                    all_allocated_addresses.add(h_hex)
                                                    heap_records[h_hex] = node_val
                                        p_tail = val["pTail"]
                                        if int(p_tail) > 0x1000:
                                            t_hex = f"0x{int(p_tail):x}"
                                            observed_active_pointers.append((f"{sname}.pTail", t_hex))
                                            if t_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(t_hex)
                                                if node_val:
                                                    all_allocated_addresses.add(t_hex)
                                                    heap_records[t_hex] = node_val
                                    except Exception:
                                        pass
                            except Exception:
                                locals_dict[sname] = ["C_DATA", "0x0", "uninitialized", "?"]
                    if block.function:
                        break
                    block = block.superblock
            except Exception:
                pass

            sal = f.find_sal()
            f_line = sal.line if sal and sal.line else (f.function().line if (hasattr(f, 'function') and f.function() and hasattr(f.function(), 'line')) else line)
            stack_to_render.append({
                "funcName": f_name,
                "orderedVarNames": ordered_varnames,
                "isHighlighted": (f == frame),
                "frameId": fp,
                "uniqueHash": f"{f_name}_{fp}",
                "encodedLocals": locals_dict,
                "line": f_line
            })

        # Address reuse check: if previous statement was an allocation statement,
        # any active pointer now referencing a previously deleted address indicates reuse!
        if pending_allocations:
            for v_name, p_addr in observed_active_pointers:
                if p_addr in deleted_addresses:
                    deleted_addresses.discard(p_addr)
                    node_val = inspect_heap_node(p_addr)
                    if node_val:
                        heap_records[p_addr] = node_val
            pending_allocations = False

        # Deep BFS discovery along pNext pointers
        check_queue = list(heap_records.keys())
        while check_queue:
            curr_addr = check_queue.pop(0)
            struct_rep = heap_records.get(curr_addr)
            if struct_rep and struct_rep[0] == "C_STRUCT":
                for field in struct_rep[3:]:
                    if field[0] == "pNext" and field[1] and field[1][0] == "C_DATA":
                        next_addr = field[1][3]
                        if next_addr and next_addr != "0x0" and next_addr not in heap_records:
                            if next_addr not in deleted_addresses:
                                node_val = inspect_heap_node(next_addr)
                                if node_val:
                                    all_allocated_addresses.add(next_addr)
                                    heap_records[next_addr] = node_val
                                    check_queue.append(next_addr)

        # Include deleted nodes marked with freed status using cached data
        for d_addr in deleted_addresses:
            if d_addr not in heap_records:
                cached = last_known_node_values.get(d_addr)
                if cached:
                    info_val = None
                    for f in cached[3:]:
                        if f[0] == "info":
                            info_val = f[1]
                            break
                    heap_records[d_addr] = [
                        "C_STRUCT",
                        d_addr,
                        "NODE (freed)",
                        ["info", info_val or ["C_DATA", d_addr, "int", "?"]],
                        ["pNext", ["C_DATA", "0x0", "pointer", "0x0"]]
                    ]
                else:
                    heap_records[d_addr] = [
                        "C_STRUCT",
                        d_addr,
                        "NODE (freed)",
                        ["info", ["C_DATA", d_addr, "int", "?"]],
                        ["pNext", ["C_DATA", "0x0", "pointer", "0x0"]]
                    ]

        current_stdout = read_current_stdout()

        # Record this execution snapshot (BEFORE line executes)
        trace.append({
            "event": "stepLine",
            "line": line,
            "funcName": func_name,
            "codeText": code_text,
            "stackToRender": stack_to_render,
            "globals": {},
            "heap": heap_records,
            "orderedGlobals": [],
            "stdout": current_stdout,
            "deletedAddresses": list(deleted_addresses),
            "snapshotConvention": "before-statement"
        })

        # Check if THIS statement allocates memory (new or CreateNode)
        if "new " in code_text or "CreateNode" in code_text:
            pending_allocations = True

    else:
        # Foreign file (STL or CRT)
        consecutive_foreign_steps += 1
        if consecutive_foreign_steps > 300:
            pass

    # Step forward to next statement
    try:
        res = gdb.execute("step", to_string=True)
        if "exited" in res:
            m = re.search(r"exited with code (\d+)", res)
            if m and m.group(1) != "0":
                termination_status = "abnormal_exit"
                termination_reason = f"Tiến trình thoát bất thường với mã lỗi {m.group(1)}"
            else:
                termination_status = "normal"
                termination_reason = "Chương trình kết thúc bình thường (Exit code 0)"
            break
        elif any(sig in res for sig in ("SIGSEGV", "Segmentation fault", "SIGABRT", "Aborted", "received signal")):
            termination_status = "crashed"
            termination_reason = f"Lỗi truy cập bộ nhớ nghiêm trọng (Segmentation Fault / Signal): {res.strip()}"
            break
        if len(gdb.inferiors()) == 0 or gdb.inferiors()[0].pid == 0:
            break
    except Exception as step_err:
        err_msg = str(step_err)
        if "received signal" in err_msg or "SIGSEGV" in err_msg:
            termination_status = "crashed"
            termination_reason = f"Lỗi thực thi: {err_msg}"
        else:
            termination_status = "interrupted"
            termination_reason = f"Quá trình thực thi bị gián đoạn: {err_msg}"
        break

if step_count >= MAX_STEPS:
    termination_status = "truncated"
    termination_reason = f"Vượt quá giới hạn tối đa {MAX_STEPS} bước thực thi cho phép"

# Commit any deallocations that executed on the final statement before program exit
for f_addr in observed_freed_addresses:
    if f_addr in all_allocated_addresses:
        deleted_addresses.add(f_addr)

# Flush stdout buffers
time.sleep(0.05)
final_stdout = read_current_stdout()
if not final_stdout:
    time.sleep(0.1)
    final_stdout = read_current_stdout()

# Update final step event and backfill stdout
if trace:
    if termination_status == "normal":
        trace[-1]["event"] = "return"
    else:
        trace[-1]["event"] = termination_status
        trace[-1]["terminationReason"] = termination_reason

    if final_stdout:
        for k in range(max(0, len(trace) - 5), len(trace)):
            trace[k]["stdout"] = final_stdout

# Write final trace file
with open(TRACE_FILE, "w", encoding="utf-8") as f:
    json.dump({
        "total_steps": len(trace),
        "termination_status": termination_status,
        "termination_reason": termination_reason,
        "trace": trace
    }, f, indent=2)

print(f"TRACING_COMPLETE: {len(trace)} steps written to {TRACE_FILE} [status={termination_status}]")

try:
    gdb.execute("kill")
except Exception:
    pass

try:
    gdb.execute("quit")
except Exception:
    pass

try:
    import os
    os._exit(0)
except Exception:
    pass
