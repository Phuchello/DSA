import gdb
import json
import os
import re

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
for attempt in range(4):
    try:
        gdb.execute(start_cmd)
        started = True
        break
    except Exception as e:
        time.sleep(0.15)

if not started:
    try:
        gdb.execute("b main")
        gdb.execute(start_cmd.replace("start", "run", 1))
    except Exception as e2:
        with open("gdb_run_error.log", "w") as ef:
            ef.write(f"run error: {e2}\n")

trace = []
step_count = 0
deleted_addresses = set()
all_allocated_addresses = set()
source_lines_cache = {}

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
    if STDOUT_FILE and os.path.exists(STDOUT_FILE):
        try:
            with open(STDOUT_FILE, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception:
            return ""
    return ""

def parse_val(val):
    """Encodes a gdb.Value into the See++ C_DATA / C_STRUCT / C_ARRAY format."""
    if val is None:
        return ["C_DATA", "0x0", "null", None]
    try:
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
    try:
        val = gdb.parse_and_eval(f"*(NODE*){addr_hex}")
        return parse_val(val)
    except Exception:
        return None

last_stdout = ""
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

        # Detect delete statements: e.g. "delete temp;" or "delete p;"
        del_match = re.search(r'\bdelete\s+([A-Za-z_][A-Za-z0-9_]*)', code_text)
        if del_match:
            del_var = del_match.group(1)
            try:
                var_val = frame.read_var(del_var)
                if var_val and int(var_val) != 0:
                    del_addr = f"0x{int(var_val):x}"
                    deleted_addresses.add(del_addr)
            except Exception:
                pass

        # Build stackToRender
        stack_to_render = []
        heap_records = {}

        # Collect user frames
        cur_f = frame
        f_list = []
        while cur_f:
            f_sal = cur_f.find_sal()
            f_fn = os.path.basename(f_sal.symtab.filename) if f_sal and f_sal.symtab and f_sal.symtab.filename else ""
            if f_fn == TARGET_FILE:
                f_list.append(cur_f)
            cur_f = cur_f.older()
        f_list.reverse()

        for idx, f in enumerate(f_list):
            f_name = f.name() or "???"
            fp = hex(int(f.read_register("sp"))) if f.is_valid() else f"frame_{idx}"
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
                                val = f.read_var(sym)
                                parsed = parse_val(val)
                                locals_dict[sname] = parsed

                                # Detect NODE pointers
                                t_str = str(val.type.strip_typedefs())
                                if "NODE" in t_str and val.type.code == gdb.TYPE_CODE_PTR:
                                    try:
                                        ptr_val = int(val)
                                        if ptr_val != 0:
                                            p_addr_hex = f"0x{ptr_val:x}"
                                            all_allocated_addresses.add(p_addr_hex)
                                            if p_addr_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(p_addr_hex)
                                                if node_val:
                                                    heap_records[p_addr_hex] = node_val
                                    except Exception:
                                        pass
                                elif "LIST" in t_str:
                                    try:
                                        p_head = val["pHead"]
                                        if int(p_head) != 0:
                                            h_hex = f"0x{int(p_head):x}"
                                            all_allocated_addresses.add(h_hex)
                                            if h_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(h_hex)
                                                if node_val:
                                                    heap_records[h_hex] = node_val
                                        p_tail = val["pTail"]
                                        if int(p_tail) != 0:
                                            t_hex = f"0x{int(p_tail):x}"
                                            all_allocated_addresses.add(t_hex)
                                            if t_hex not in deleted_addresses:
                                                node_val = inspect_heap_node(t_hex)
                                                if node_val:
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

            stack_to_render.append({
                "funcName": f_name,
                "orderedVarNames": ordered_varnames,
                "isHighlighted": (f == frame),
                "frameId": fp,
                "uniqueHash": f"{f_name}_{fp}",
                "encodedLocals": locals_dict,
                "line": f.find_sal().line
            })

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
                            all_allocated_addresses.add(next_addr)
                            if next_addr not in deleted_addresses:
                                node_val = inspect_heap_node(next_addr)
                                if node_val:
                                    heap_records[next_addr] = node_val
                                    check_queue.append(next_addr)

        # Include deleted nodes marked with freed status if they were ever allocated
        for d_addr in deleted_addresses:
            if d_addr not in heap_records:
                heap_records[d_addr] = ["C_STRUCT", d_addr, "NODE (freed)", ["info", ["C_DATA", d_addr, "int", "?"]], ["pNext", ["C_DATA", "0x0", "pointer", "0x0"]]]

        current_stdout = read_current_stdout()

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
            "deletedAddresses": list(deleted_addresses)
        })

    else:
        # We stepped into a foreign file (e.g. standard library)
        consecutive_foreign_steps += 1
        if consecutive_foreign_steps > 200:
            pass

    # Step forward
    try:
        res = gdb.execute("step", to_string=True)
        if "exited" in res or len(gdb.inferiors()) == 0 or gdb.inferiors()[0].pid == 0:
            break
    except Exception:
        break

import time

# Give Windows OS brief moment to flush file buffers upon process exit
time.sleep(0.05)
final_stdout = read_current_stdout()
if not final_stdout:
    time.sleep(0.1)
    final_stdout = read_current_stdout()

# Mark last step and backfill final stdout if missing
if trace:
    trace[-1]["event"] = "return"
    if final_stdout:
        for k in range(max(0, len(trace) - 5), len(trace)):
            trace[k]["stdout"] = final_stdout

# Write final trace file
with open(TRACE_FILE, "w", encoding="utf-8") as f:
    json.dump({
        "total_steps": len(trace),
        "trace": trace
    }, f, indent=2)

print(f"TRACING_COMPLETE: {len(trace)} steps written to {TRACE_FILE}")

try:
    gdb.execute("quit")
except Exception:
    pass
