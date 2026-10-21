import gdb
import json
import os
import re
import time

# Configure GDB parameters
gdb.execute("set pagination off")
gdb.execute("set confirm off")
gdb.execute("set print address on")
gdb.execute("set print pretty off")
gdb.execute("set breakpoint pending on")

try:
    gdb.execute("skip -rfu ^std::")
    gdb.execute("skip -rfu ^__")
    # Avoid file-regex skip rules here. MinGW/GDB versions normalize Windows
    # source paths differently; these patterns can hide user functions too.
    # Runtime frames remain filtered by function name and source file below.
except Exception:
    pass

TARGET_FILE = os.environ.get("FLOWLAB_TARGET_FILE", "source.cpp")
STDIN_FILE = os.environ.get("FLOWLAB_STDIN_FILE", "")
STDOUT_FILE = os.environ.get("FLOWLAB_STDOUT_FILE", "")
TRACE_FILE = os.environ.get("FLOWLAB_TRACE_FILE", "trace.json")
MAX_STEPS = int(os.environ.get("FLOWLAB_MAX_STEPS", "1000"))
TARGET_ABI = os.environ.get("FLOWLAB_TARGET_ABI", "").lower()
DEBUG_DEALLOC = os.environ.get("FLOWLAB_DEBUG_DEALLOC", "") == "1"
DEBUG_FILE = os.environ.get("FLOWLAB_DEALLOC_DEBUG_FILE", TRACE_FILE + ".dealloc.jsonl")

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
completed_deallocations = []
in_flight_deallocations = set()
node_allocation_generations = {}
live_node_allocations = {}
source_lines_cache = {}
last_known_node_values = {}  # Cache of last known struct contents before deallocation
last_stdout_size = -1
last_stdout_cache = ""
last_frame_ids = []

def source_location(frame):
    try:
        sal = frame.find_sal()
        if sal and sal.symtab and sal.symtab.filename:
            return {
                "file": os.path.basename(sal.symtab.filename.replace("\\", "/")),
                "path": sal.symtab.filename,
                "line": int(sal.line or 0)
            }
    except Exception:
        pass
    return {"file": "", "path": "", "line": 0}

def debug_deallocation(event, **details):
    if not DEBUG_DEALLOC:
        return
    try:
        record = {"event": event, "time": time.time(), **details}
        with open(DEBUG_FILE, "a", encoding="utf-8") as df:
            df.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass

def current_allocation_identity(address):
    generation = node_allocation_generations.get(address)
    if generation is None or live_node_allocations.get(address) != generation:
        return None
    return {"address": address, "generation": generation, "identity": f"{address}@{generation}"}

def track_node_allocation(address):
    """Return true only for an address registered from operator new's return value."""
    current_generation = node_allocation_generations.get(address)
    return current_generation is not None and live_node_allocations.get(address) == current_generation


def register_node_allocation(address):
    """Bind positive GDB allocation-return evidence to the exact NODE address."""
    if not address or address == "0x0":
        return False
    if track_node_allocation(address):
        return True
    if address in deleted_addresses:
        deleted_addresses.discard(address)
        generation = node_allocation_generations.get(address, 1) + 1
    else:
        generation = node_allocation_generations.setdefault(address, 1)
    node_allocation_generations[address] = generation
    live_node_allocations[address] = generation
    return True

def target_delete_argument_register():
    """Use the ABI selected by the compiler target, not Python's host platform."""
    if TARGET_ABI == "windows-x64":
        return "rcx"
    if TARGET_ABI == "sysv-x64":
        return "rdi"
    # Conservative fallback for direct/manual tracer invocations. An unknown ABI
    # must not turn an arbitrary register value into a deallocation observation.
    try:
        abi = gdb.execute("show osabi", to_string=True).lower()
        if "windows" in abi or "cygwin" in abi:
            return "rcx"
        if "linux" in abi or "darwin" in abi or "freebsd" in abi:
            return "rdi"
    except Exception:
        pass
    return None

def deallocation_call_site(frame):
    """Accept direct user-code delete calls, excluding allocator/STL deallocations."""
    cur = frame
    allowed_wrappers = ("operator delete", "operator delete[]", "_Zdl", "_Zda")
    crossed_runtime_frame = False
    while cur:
        try:
            name = cur.name() or ""
            # MinGW/GDB on Windows may qualify symbols with the shared-library
            # name (for example, ``libstdc++-6!_ZdlPv``). Strip that qualifier
            # before recognizing the operator-delete entry frame.
            symbol_name = name.rsplit("!", 1)[-1]
            if any(symbol_name.startswith(prefix) for prefix in allowed_wrappers):
                cur = cur.older()
                continue
            loc = source_location(cur)
            if loc["file"] != os.path.basename(TARGET_FILE.replace("\\", "/")):
                crossed_runtime_frame = True
                cur = cur.older()
                continue
            code = read_source_line(loc["path"], loc["line"])
            call_site = {"function": name, "location": loc, "code": code}
            if crossed_runtime_frame:
                return call_site, "intervening-runtime-frame"
            return call_site, None
        except Exception:
            return None, "unreadable-call-site"
    return None, "missing-user-call-site"

class DeallocationBreakpoint(gdb.Breakpoint):
    """Runtime debugger-observed deallocation tracker.
    Intercepts calls to operator delete at the CPU register level,
    recording the exact address passed to the deallocator.
    """
    def __init__(self, spec):
        super().__init__(spec, gdb.BP_BREAKPOINT, internal=True)
        self.spec = spec
        self.silent = True

    def stop(self):
        diag = {"breakpoint_symbol": self.spec, "breakpoint_location": str(self.location)}
        try:
            f = gdb.newest_frame()
            diag["program_counter"] = hex(int(f.pc()))
            diag["call_stack"] = []
            cur = f
            for _ in range(12):
                if cur is None:
                    break
                try:
                    frame_pc = hex(int(cur.pc()))
                except Exception:
                    frame_pc = None
                diag["call_stack"].append({"function": cur.name() or "???", "source": source_location(cur), "pc": frame_pc})
                cur = cur.older()
            reg_name = target_delete_argument_register()
            diag["target_abi"] = TARGET_ABI or "unknown"
            diag["argument_register"] = reg_name
            if not reg_name:
                debug_deallocation("ignored", reason="unknown-target-abi", **diag)
                return False
            try:
                val = int(f.read_register(reg_name))
                diag["candidate_address"] = f"0x{val:x}"
            except Exception:
                debug_deallocation("ignored", reason="argument-register-unavailable", **diag)
                return False
            addr_hex = diag["candidate_address"]
            diag["tracked_node_allocation"] = current_allocation_identity(addr_hex)
            call_site, rejection = deallocation_call_site(f)
            diag["source_execution_location"] = call_site
            if val <= 0x1000 or diag["tracked_node_allocation"] is None:
                debug_deallocation("ignored", reason="address-not-a-live-tracked-node", **diag)
                return False
            if rejection:
                debug_deallocation("ignored", reason=rejection, **diag)
                return False
            allocation_identity = diag["tracked_node_allocation"]["identity"]
            if allocation_identity in in_flight_deallocations:
                debug_deallocation("ignored", reason="duplicate-or-aliased-delete-breakpoint", **diag)
                return False
            in_flight_deallocations.add(allocation_identity)
            # The breakpoint is at the operator delete entry. Record an event only
            # after this exact deallocator frame returns successfully.
            try:
                DeallocationReturnBreakpoint(f, addr_hex, diag["tracked_node_allocation"], diag)
            except Exception:
                in_flight_deallocations.discard(allocation_identity)
                raise
        except Exception:
            debug_deallocation("ignored", reason="breakpoint-inspection-error", **diag)
        return False

class DeallocationReturnBreakpoint(gdb.FinishBreakpoint):
    """Confirms that a matched operator delete call returned before marking it freed."""
    def __init__(self, frame, address, allocation, entry_diagnostic):
        super().__init__(frame, internal=True)
        self.address = address
        self.allocation = allocation
        self.entry_diagnostic = entry_diagnostic
        self.silent = True

    def stop(self):
        current = current_allocation_identity(self.address)
        self.in_flight_identity = self.allocation["identity"]
        in_flight_deallocations.discard(self.in_flight_identity)
        if current and current["identity"] == self.allocation["identity"]:
            completed_deallocations.append(self.allocation)
            debug_deallocation("completed", **self.entry_diagnostic)
        else:
            debug_deallocation("ignored-at-return", reason="allocation-generation-changed", **self.entry_diagnostic)
        return False

    def out_of_scope(self):
        in_flight_deallocations.discard(self.allocation["identity"])
        debug_deallocation("aborted", reason="deallocator-did-not-return", **self.entry_diagnostic)

# GCC/MinGW use Itanium ABI mangled spellings. Avoid also installing the same
# overloads through demangled names, which can create duplicate locations.
for spec in [
    '_ZdlPv',      # unsized scalar delete
    '_ZdaPv',      # unsized array delete
    '_ZdlPvy',     # sized scalar delete, size_t = unsigned long long
    '_ZdaPvy',     # sized array delete
    '_ZdlPvm',     # sized scalar delete, size_t = unsigned long
    '_ZdaPvm',     # sized array delete
]:
    try:
        DeallocationBreakpoint(spec)
        debug_deallocation("breakpoint-installed", breakpoint_symbol=spec)
    except Exception as exc:
        debug_deallocation("breakpoint-unavailable", breakpoint_symbol=spec, error=str(exc))

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

class NodeAllocationReturnBreakpoint(gdb.FinishBreakpoint):
    """Records the precise address returned by a confirmed scalar operator new."""
    def __init__(self, frame, entry_diagnostic):
        super().__init__(frame, internal=True)
        self.entry_diagnostic = entry_diagnostic
        self.silent = True

    def stop(self):
        try:
            returned_value = self.return_value
            if returned_value is None:
                # MinGW GDB may not load a return type for libstdc++'s
                # operator new symbol; the target ABI still defines RAX.
                return_register = "rax" if TARGET_ABI in ("windows-x64", "sysv-x64") else "eax"
                returned_value = gdb.parse_and_eval("$" + return_register)
            address = f"0x{int(returned_value):x}"
            if int(address, 16) > 0x1000:
                register_node_allocation(address)
                debug_deallocation("node-allocation-returned", address=address, **self.entry_diagnostic)
        except Exception as exc:
            debug_deallocation("node-allocation-return-unavailable", error=str(exc), **self.entry_diagnostic)
        return False

    def out_of_scope(self):
        debug_deallocation("node-allocation-aborted", **self.entry_diagnostic)


class NodeAllocationBreakpoint(gdb.Breakpoint):
    """Correlates a NODE-sized allocator call with its exact returned address."""
    def __init__(self, spec):
        super().__init__(spec, gdb.BP_BREAKPOINT, internal=True)
        self.spec = spec
        self.silent = True

    def stop(self):
        try:
            if TARGET_ABI == "windows-x64":
                size_register = "rcx"
            elif TARGET_ABI == "sysv-x64":
                size_register = "rdi"
            else:
                return False
            requested_size = int(gdb.parse_and_eval("$" + size_register))
            try:
                node_type = gdb.lookup_type("NODE")
            except Exception:
                node_type = gdb.lookup_type("struct NODE")
            if requested_size != int(node_type.sizeof):
                return False

            allocator_frame = gdb.newest_frame()
            caller = allocator_frame.older() if allocator_frame else None
            call_site = None
            while caller:
                location = source_location(caller)
                if location["file"] == TARGET_FILE:
                    source_text = read_source_line(location["path"], location["line"])
                    # The source expression is corroboration only. Heap identity is
                    # created solely from the matching operator-new return address.
                    if re.search(r"\bnew\s+(?:struct\s+)?NODE\b", source_text):
                        call_site = location
                        break
                try:
                    caller = caller.older()
                except Exception:
                    break
            if not call_site:
                return False

            diagnostic = {"breakpoint_symbol": self.spec, "call_site": call_site}
            NodeAllocationReturnBreakpoint(allocator_frame, diagnostic)
        except Exception as exc:
            debug_deallocation("node-allocation-breakpoint-ignored", breakpoint_symbol=self.spec, error=str(exc))
        return False


for allocation_spec in ("_Znwm", "_Znwy", "_Znwj"):
    try:
        NodeAllocationBreakpoint(allocation_spec)
        debug_deallocation("node-allocation-breakpoint-installed", breakpoint_symbol=allocation_spec)
    except Exception as exc:
        debug_deallocation("node-allocation-breakpoint-unavailable", breakpoint_symbol=allocation_spec, error=str(exc))

def declaration_is_current_statement(symbol, line_text):
    """Identify a local declared by the current source statement before reading its storage."""
    try:
        name = symbol.name
        variable = re.search(r"(?<![A-Za-z0-9_])" + re.escape(name) + r"\s*(?:=|;|,|\[|\{)", line_text)
        if not variable:
            return False
        declared_type = str(symbol.type.strip_typedefs())
        prefix = re.sub(r"\s+", "", line_text[:variable.start()])
        declared_type = re.sub(r"\s+", "", declared_type)
        return bool(declared_type and prefix.endswith(declared_type))
    except Exception:
        return False

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

def record_inferior_stop(event):
    global termination_status, termination_reason
    if not isinstance(event, gdb.SignalEvent):
        return
    stop_signal = getattr(event, "stop_signal", "")
    if not stop_signal:
        return
    if stop_signal in ("SIGSEGV", "SIGABRT", "SIGBUS", "SIGILL", "SIGFPE"):
        termination_status = "crashed"
        termination_reason = f"Chương trình dừng bởi tín hiệu nghiêm trọng {stop_signal}"
    else:
        termination_status = "interrupted"
        termination_reason = f"Chương trình bị gián đoạn bởi tín hiệu {stop_signal}"

gdb.events.stop.connect(record_inferior_stop)

while step_count < MAX_STEPS:
    step_count += 1
    try:
        frame = gdb.selected_frame()
    except Exception:
        break

    sal = frame.find_sal()
    symtab = sal.symtab
    raw_fname = symtab.filename if symtab and symtab.filename else ""
    filename = os.path.basename(raw_fname.replace('\\', '/'))
    line = sal.line
    func_name = frame.name() or ""

    # Check if we are inside user code
    if filename == TARGET_FILE and func_name:
        consecutive_foreign_steps = 0
        code_text = read_source_line(raw_fname, line)

        # -------------------------------------------------------------
        # EXACT BEFORE-STATEMENT SNAPSHOT SEMANTICS:
        # Commit only deallocations whose operator delete frame returned during
        # the previous step, and only for the same live NODE allocation generation.
        # -------------------------------------------------------------
        for allocation in completed_deallocations:
            f_addr = allocation["address"]
            if live_node_allocations.get(f_addr) == allocation["generation"]:
                deleted_addresses.add(f_addr)
                live_node_allocations.pop(f_addr, None)
        completed_deallocations.clear()

        # Build stackToRender and discover active pointers
        stack_to_render = []
        heap_records = {}
        stack_node_records = {}
        unknown_node_records = {}

        def observe_node_address(address):
            # A readable NODE is not evidence of a heap allocation. Stack
            # objects were collected from frame locals in a first pass.
            if address in stack_node_records:
                return
            if address in deleted_addresses:
                return
            node_val = inspect_heap_node(address)
            if not node_val:
                return
            if track_node_allocation(address):
                unknown_node_records.pop(address, None)
                heap_records[address] = node_val
            else:
                unknown_node_records.setdefault(address, node_val)

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
                if is_user:
                    f_list.append(cur_f)
            except Exception:
                pass

            try:
                cur_f = cur_f.older()
            except Exception:
                break
        f_list.reverse()

        frame_ids = []
        for idx, f in enumerate(f_list):
            try:
                frame_ids.append(hex(int(f.read_register("sp"))))
            except Exception:
                try:
                    frame_ids.append(hex(int(f.pc())))
                except Exception:
                    frame_ids.append(f"frame_{idx}")

        for idx, f in enumerate(f_list):
            f_name = f.name() or "???"
            fp = frame_ids[idx]
            frame_source = source_location(f)
            f_line = frame_source["line"] or line
            f_code_text = read_source_line(frame_source["path"], f_line)
            locals_dict = {}
            parameter_values = {}
            ordered_varnames = []
            symbols = []
            symbol_values = {}

            # Read each local once, collecting every stack NODE before looking
            # at pointer targets. This prevents a same-snapshot &local from
            # being mistaken for a heap address based on frame iteration order.
            try:
                block = f.block()
                while block:
                    for sym in block:
                        if (sym.is_argument or sym.is_variable) and sym.name not in locals_dict:
                            locals_dict[sym.name] = None
                            symbols.append(sym)
                            ordered_varnames.append(sym.name)
                    if block.function:
                        break
                    block = block.superblock
            except Exception:
                pass

            for sym in symbols:
                sname = sym.name
                try:
                    if (hasattr(sym, 'line') and sym.line and not sym.is_argument
                        and (sym.line > f_line or (sym.line == f_line and declaration_is_current_statement(sym, f_code_text)))):
                        locals_dict[sname] = ["C_DATA", "0x0", "uninitialized", "?"]
                        continue
                    val = f.read_var(sym)
                    symbol_values[sname] = val
                    parsed = parse_val(val)
                    locals_dict[sname] = parsed
                    if sym.is_argument:
                        parameter_values[sname] = parsed

                    val_type = val.type.strip_typedefs()
                    type_name = str(val_type)
                    if val_type.code == gdb.TYPE_CODE_STRUCT and re.search(r"\bNODE\b", type_name):
                        try:
                            node_address = f"0x{int(val.address):x}"
                            if parsed and parsed[0] == "C_STRUCT":
                                stack_node_records[node_address] = parsed
                        except Exception:
                            pass
                except Exception:
                    locals_dict[sname] = ["C_DATA", "0x0", "uninitialized", "?"]

            for sym in symbols:
                sname = sym.name
                val = symbol_values.get(sname)
                if val is None:
                    continue
                try:
                    val_type = val.type.strip_typedefs()
                    type_name = str(val_type)
                    if "NODE" in type_name and val_type.code == gdb.TYPE_CODE_PTR:
                        ptr_val = int(val)
                        if ptr_val > 0x1000:
                            address = f"0x{ptr_val:x}"
                            observe_node_address(address)
                    elif "LIST" in type_name:
                        for field_name in ("pHead", "pTail"):
                            try:
                                field_value = val[field_name]
                                if int(field_value) <= 0x1000:
                                    continue
                                address = f"0x{int(field_value):x}"
                                observe_node_address(address)
                            except Exception:
                                pass
                except Exception:
                    pass

            stack_to_render.append({
                "funcName": f_name,
                "orderedVarNames": ordered_varnames,
                "isHighlighted": (f == frame),
                "frameId": fp,
                "uniqueHash": f"{f_name}_{fp}",
                "encodedLocals": locals_dict,
                "parameterValues": parameter_values,
                "line": f_line,
                "sourceLocation": frame_source,
                "frameDepth": idx,
                "parentFrameId": frame_ids[idx - 1] if idx > 0 else None,
                "childFrameId": frame_ids[idx + 1] if idx + 1 < len(frame_ids) else None
            })

        # Discover NODE topology without upgrading readable addresses to heap.
        check_queue = list(dict.fromkeys(list(heap_records.keys()) + list(stack_node_records.keys()) + list(unknown_node_records.keys())))
        visited_nodes = set()
        while check_queue:
            curr_addr = check_queue.pop(0)
            if curr_addr in visited_nodes:
                continue
            visited_nodes.add(curr_addr)
            struct_rep = heap_records.get(curr_addr) or stack_node_records.get(curr_addr) or unknown_node_records.get(curr_addr)
            if struct_rep and struct_rep[0] == "C_STRUCT":
                for field in struct_rep[3:]:
                    if field[0] == "pNext" and field[1] and field[1][0] == "C_DATA":
                        next_addr = field[1][3]
                        if not next_addr or next_addr == "0x0":
                            continue
                        if next_addr not in heap_records and next_addr not in stack_node_records and next_addr not in unknown_node_records:
                            observe_node_address(next_addr)
                        if next_addr in heap_records or next_addr in stack_node_records or next_addr in unknown_node_records:
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
        current_frame_ids = frame_ids
        event_type = "stepLine"
        if last_frame_ids:
            shared_prefix = 0
            while (shared_prefix < len(last_frame_ids) and shared_prefix < len(current_frame_ids)
                   and last_frame_ids[shared_prefix] == current_frame_ids[shared_prefix]):
                shared_prefix += 1
            if shared_prefix == len(last_frame_ids) and len(current_frame_ids) > len(last_frame_ids):
                event_type = "call"
            elif shared_prefix == len(current_frame_ids) and len(current_frame_ids) < len(last_frame_ids):
                event_type = "return"

        trace.append({
            "event": event_type,
            "line": line,
            "funcName": func_name,
            "codeText": code_text,
            "stackToRender": stack_to_render,
            "globals": {},
            "heap": heap_records,
            "stackNodes": stack_node_records,
            "unknownNodes": unknown_node_records,
            "orderedGlobals": [],
            "stdout": current_stdout,
            "deletedAddresses": list(deleted_addresses),
            "snapshotConvention": "before-statement"
        })
        last_frame_ids = current_frame_ids

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
        if termination_status != "normal":
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

# Commit completed deallocations before termination; incomplete/ambiguous entries
# remain unclassified and therefore normalize to unknown rather than freed.
for allocation in completed_deallocations:
    f_addr = allocation["address"]
    if live_node_allocations.get(f_addr) == allocation["generation"]:
        deleted_addresses.add(f_addr)
        live_node_allocations.pop(f_addr, None)

# Flush stdout buffers
time.sleep(0.05)
final_stdout = read_current_stdout()
if not final_stdout:
    time.sleep(0.1)
    final_stdout = read_current_stdout()

# Update the final step event. Keep flushed stdout on the snapshots where GDB
# observed it; bytes buffered until process exit belong to a separate final
# output field because their exact statement timing is unknown.
if trace:
    if termination_status == "normal":
        trace[-1]["event"] = "return"
    else:
        trace[-1]["event"] = termination_status
        trace[-1]["terminationReason"] = termination_reason

# Write final trace file
with open(TRACE_FILE, "w", encoding="utf-8") as f:
    json.dump({
        "total_steps": len(trace),
        "termination_status": termination_status,
        "termination_reason": termination_reason,
        "final_stdout": final_stdout,
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
