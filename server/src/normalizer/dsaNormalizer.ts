import { RawExecutionPoint, RawExecutionPointSchema } from './schema.js';

export interface DsaNode {
  id: string;
  address: string;
  generation: number;
  info: number | string | null;
  nextAddress: string | null;
  status: 'allocated' | 'detached' | 'unreachable' | 'freed';
}

export interface DsaPointer {
  name: string;
  targetAddress: string | null;
  state: 'valid' | 'null' | 'freed' | 'dangling' | 'uninitialized' | 'unknown';
  varAddress?: string;
  color?: string;
}

export interface DsaDiff {
  changedVariables: string[];
  allocatedNodes: string[];
  freedNodes: string[];
  unlinkedNodes: string[];
  pointerReroutes: Array<{ pointer: string; from: string | null; to: string | null }>;
}

export interface NormalizedExecutionPoint {
  step: number;
  line: number;
  funcName: string;
  codeText: string;
  stdout: string;
  event: string;
  snapshotConvention: string;
  stackToRender: any[];
  heap: Record<string, any>;
  dsa: {
    nodes: DsaNode[];
    mainChain: DsaNode[];
    detachedNodes: DsaNode[];
    unreachableNodes: DsaNode[];
    freedNodes: DsaNode[];
    pointers: DsaPointer[];
    diff: DsaDiff;
    vietnameseExplanation: string;
    advancedNotes: string;
  };
}

const POINTER_COLORS: Record<string, string> = {
  pHead: '#3B82F6', // Blue
  pTail: '#8B5CF6', // Purple
  p: '#10B981',     // Green
  prev: '#F59E0B',  // Amber
  temp: '#EF4444',  // Red
  head: '#3B82F6',
  tail: '#8B5CF6',
  cur: '#10B981',
  current: '#10B981',
};

export function extractInfo(cStruct: any): number | string | null {
  if (!Array.isArray(cStruct) || cStruct[0] !== 'C_STRUCT') return null;
  for (let i = 3; i < cStruct.length; i++) {
    const field = cStruct[i];
    if (field && field[0] === 'info') {
      const cData = field[1];
      if (cData && Array.isArray(cData) && cData[0] === 'C_DATA') {
        return cData[3];
      }
    }
  }
  return null;
}

export function extractNextAddress(cStruct: any): string | null {
  if (!Array.isArray(cStruct) || cStruct[0] !== 'C_STRUCT') return null;
  for (let i = 3; i < cStruct.length; i++) {
    const field = cStruct[i];
    if (field && (field[0] === 'pNext' || field[0] === 'next')) {
      const cData = field[1];
      if (cData && Array.isArray(cData) && cData[0] === 'C_DATA') {
        const addr = cData[3];
        return addr && addr !== '0x0' ? addr : null;
      }
    }
  }
  return null;
}

/**
 * Normalizes raw GDB trace points into pedagogical learning snapshots.
 * Enforces explicit before-statement snapshot convention, root-reachability graph traversal,
 * precise pointer classifications, and stable object identities across address reuse.
 */
export function normalizeTrace(rawTrace: any[]): NormalizedExecutionPoint[] {
  const normalized: NormalizedExecutionPoint[] = [];

  // Track allocation generations for stable object identity across address reuse
  const addressGenerations = new Map<string, number>();
  const activeFreedAddresses = new Set<string>();

  let prevPoint: NormalizedExecutionPoint | null = null;

  for (let i = 0; i < rawTrace.length; i++) {
    // Validate schema — malformed steps must NOT silently fall back to unvalidated data.
    // If a step fails validation, emit a controlled error sentinel instead.
    const parseResult = RawExecutionPointSchema.safeParse(rawTrace[i]);
    if (!parseResult.success) {
      // Emit a controlled error step rather than silently discarding or using raw data
      normalized.push({
        step: i,
        line: 0,
        funcName: '__schema_error__',
        codeText: '',
        stdout: '',
        event: 'schema_error',
        snapshotConvention: 'before-statement',
        stackToRender: [],
        heap: {},
        dsa: {
          nodes: [],
          mainChain: [],
          detachedNodes: [],
          unreachableNodes: [],
          freedNodes: [],
          pointers: [],
          diff: { changedVariables: [], allocatedNodes: [], freedNodes: [], unlinkedNodes: [], pointerReroutes: [] },
          vietnameseExplanation: `Lỗi xác thực dữ liệu vết thực thi tại bước ${i}: ${parseResult.error.message}`,
          advancedNotes: `Schema validation error at step ${i}: ${JSON.stringify(parseResult.error.issues)}`
        }
      });
      continue;
    }
    const rawEp = parseResult.data;

    const heap = rawEp.heap || {};
    const deletedInStep = rawEp.deletedAddresses || [];

    for (const d of deletedInStep) {
      activeFreedAddresses.add(d);
    }

    // Detect address reuse before classifying pointers:
    // If an address was marked freed, but now heap contains an active (non-freed) node struct,
    // and in previous step it was freed: it has been re-allocated by operator new (Address Reuse!)
    for (const [addr, rawNode] of Object.entries(heap)) {
      const rawType = Array.isArray(rawNode) && rawNode[2] ? String(rawNode[2]) : '';
      const isRawFreed = rawType.includes('(freed)');
      if (activeFreedAddresses.has(addr) && !isRawFreed && prevPoint && prevPoint.dsa.freedNodes.some(n => n.address === addr)) {
        addressGenerations.set(addr, (addressGenerations.get(addr) || 1) + 1);
        activeFreedAddresses.delete(addr);
      }
    }

    // 1. Discover all pointers across stack frames and globals
    const pointers: DsaPointer[] = [];
    const stackFrames = rawEp.stackToRender || [];

    for (const frame of stackFrames) {
      const locals = frame.encodedLocals || {};
      for (const [varName, val] of Object.entries(locals)) {
        if (!Array.isArray(val)) continue;

        // Uninitialized variable
        if (val[0] === 'C_DATA' && val[2] === 'uninitialized') {
          if (!pointers.some(p => p.name === varName)) {
            pointers.push({
              name: varName,
              targetAddress: null,
              state: 'uninitialized',
              varAddress: val[1],
              color: '#94A3B8'
            });
          }
          continue;
        }

        // Pointer or reference
        if (val[0] === 'C_DATA' && (val[2] === 'pointer' || val[2] === 'ref')) {
          const target = val[3] && val[3] !== '0x0' ? String(val[3]) : null;
          let state: DsaPointer['state'] = 'valid';

          if (!target || target === '0x0') {
            // Null pointer — confirmed
            state = 'null';
          } else if (activeFreedAddresses.has(target)) {
            // Confirmed freed: runtime observed a delete on this address
            state = 'freed';
          } else if (heap[target]) {
            // Address is present in the observed heap graph — confirmed live NODE
            state = 'valid';
          } else {
            // Address not in heap graph. This could mean:
            //   (a) it's a non-NODE pointer (int*, char*, etc.) — we haven't collected its heap entry
            //   (b) it's a pointer that wasn't traced (library allocation)
            //   (c) it's genuinely dangling — but we have NO evidence of that
            // Conservative classification: 'unknown' to avoid false positive dangling warnings.
            state = 'unknown';
          }

          if (!pointers.some(p => p.name === varName)) {
            pointers.push({
              name: varName,
              targetAddress: target,
              state: state,
              varAddress: val[1],
              color: POINTER_COLORS[varName] || '#6B7280'
            });
          }
        }

        // Struct LIST (pHead, pTail)
        if (val[0] === 'C_STRUCT' && (val[2] === 'LIST' || val[2] === 'struct LIST')) {
          for (let f = 3; f < val.length; f++) {
            const field = val[f];
            if (field && (field[0] === 'pHead' || field[0] === 'pTail')) {
              const fieldName = `L.${field[0]}`;
              const fData = field[1];
              if (fData && Array.isArray(fData) && fData[0] === 'C_DATA') {
                const target = fData[3] && fData[3] !== '0x0' ? String(fData[3]) : null;
                let state: DsaPointer['state'] = 'valid';

                if (!target || target === '0x0') {
                  state = 'null';
                } else if (activeFreedAddresses.has(target)) {
                  state = 'freed';
                } else if (heap[target]) {
                  state = 'valid';
                } else {
                  // No positive evidence this is dangling — could be a pointer to a node
                  // that was allocated before tracing started or in an untraceable path.
                  state = 'unknown';
                }

                if (!pointers.some(p => p.name === fieldName)) {
                  pointers.push({
                    name: fieldName,
                    targetAddress: target,
                    state: state,
                    varAddress: fData[1],
                    color: POINTER_COLORS[field[0]] || '#3B82F6'
                  });
                }
              }
            }
          }
        }
      }
    }

    // 2. Discover and track heap nodes with address reuse & generations
    const nodeMap = new Map<string, DsaNode>();

    for (const [addr, rawNode] of Object.entries(heap)) {
      let isFreed = activeFreedAddresses.has(addr);
      const rawType = Array.isArray(rawNode) && rawNode[2] ? String(rawNode[2]) : '';
      const isRawFreed = rawType.includes('(freed)');

      // Handle generation for address reuse
      if (!addressGenerations.has(addr)) {
        addressGenerations.set(addr, 1);
      } else if (isFreed && !isRawFreed && prevPoint && prevPoint.dsa.freedNodes.some(n => n.address === addr)) {
        // Address was freed previously but is now allocated again (Address Reuse!)
        addressGenerations.set(addr, (addressGenerations.get(addr) || 1) + 1);
        activeFreedAddresses.delete(addr);
        isFreed = false;
      }

      const gen = addressGenerations.get(addr) || 1;
      const info = extractInfo(rawNode);
      const nextAddr = extractNextAddress(rawNode);

      nodeMap.set(addr, {
        id: `node_${addr}_gen${gen}`,
        address: addr,
        generation: gen,
        info: info,
        nextAddress: nextAddr,
        status: isFreed ? 'freed' : 'allocated'
      });
    }

    // Include any deleted addresses not present in raw heap object
    for (const d_addr of activeFreedAddresses) {
      if (!nodeMap.has(d_addr)) {
        const gen = addressGenerations.get(d_addr) || 1;
        nodeMap.set(d_addr, {
          id: `node_${d_addr}_gen${gen}`,
          address: d_addr,
          generation: gen,
          info: null,
          nextAddress: null,
          status: 'freed'
        });
      }
    }

    // 3. Multi-Root Reachability Analysis
    // Main root: pHead
    const pHeadPtr = pointers.find(p => p.name === 'L.pHead' || p.name === 'pHead' || p.name === 'head');
    const mainChainAddresses = new Set<string>();
    const mainChain: DsaNode[] = [];

    let currAddr = pHeadPtr?.targetAddress;
    while (currAddr && nodeMap.has(currAddr) && !mainChainAddresses.has(currAddr)) {
      const node = nodeMap.get(currAddr)!;
      if (node.status === 'freed') break;
      mainChainAddresses.add(currAddr);
      mainChain.push(node);
      currAddr = node.nextAddress;
    }

    // Other roots: any other stack pointer (temp, prev, p, etc.)
    const otherReachableAddresses = new Set<string>();
    for (const ptr of pointers) {
      if (ptr.targetAddress && ptr.state === 'valid' && nodeMap.has(ptr.targetAddress)) {
        let walkAddr: string | null = ptr.targetAddress;
        while (walkAddr && nodeMap.has(walkAddr) && !otherReachableAddresses.has(walkAddr)) {
          otherReachableAddresses.add(walkAddr);
          const wNode: DsaNode = nodeMap.get(walkAddr)!;
          if (wNode.status === 'freed') break;
          walkAddr = wNode.nextAddress;
        }
      }
    }

    // Classify node status accurately
    const detachedNodes: DsaNode[] = [];
    const unreachableNodes: DsaNode[] = [];
    const freedNodes: DsaNode[] = [];

    for (const [addr, node] of nodeMap.entries()) {
      if (node.status === 'freed') {
        freedNodes.push(node);
      } else if (mainChainAddresses.has(addr)) {
        node.status = 'allocated';
      } else if (otherReachableAddresses.has(addr)) {
        // Still reachable via another stack pointer (e.g. temp or detached list)
        node.status = 'detached';
        detachedNodes.push(node);
      } else {
        // Not reachable by ANY stack pointer or main list (memory leak candidate!)
        node.status = 'unreachable';
        unreachableNodes.push(node);
      }
    }

    const allOrderedNodes: DsaNode[] = [
      ...mainChain,
      ...detachedNodes,
      ...unreachableNodes,
      ...freedNodes
    ];

    // 4. Calculate diff from previous step
    const diff: DsaDiff = {
      changedVariables: [],
      allocatedNodes: [],
      freedNodes: [],
      unlinkedNodes: [],
      pointerReroutes: []
    };

    if (prevPoint) {
      // Check node allocations
      for (const node of allOrderedNodes) {
        if (!prevPoint.dsa.nodes.some(n => n.address === node.address && n.generation === node.generation)) {
          diff.allocatedNodes.push(node.address);
        }
      }
      // Check node deallocations
      for (const prevNode of prevPoint.dsa.nodes) {
        const currNode = allOrderedNodes.find(n => n.address === prevNode.address && n.generation === prevNode.generation);
        if (currNode && currNode.status === 'freed' && prevNode.status !== 'freed') {
          diff.freedNodes.push(prevNode.address);
        }
      }
      // Check unlinked nodes
      for (const prevNode of prevPoint.dsa.mainChain) {
        if (!mainChainAddresses.has(prevNode.address)) {
          diff.unlinkedNodes.push(prevNode.address);
        }
      }
      // Check pointer movements
      for (const ptr of pointers) {
        const prevPtr = prevPoint.dsa.pointers.find(p => p.name === ptr.name);
        if (prevPtr && prevPtr.targetAddress !== ptr.targetAddress) {
          diff.pointerReroutes.push({
            pointer: ptr.name,
            from: prevPtr.targetAddress,
            to: ptr.targetAddress
          });
          diff.changedVariables.push(ptr.name);
        }
      }
    }

    // 5. Synthesize Vietnamese pedagogical explanation
    const { explanation, advanced } = generateVietnameseExplanation(
      rawEp.codeText || '',
      rawEp.line,
      rawEp.funcName,
      pointers,
      allOrderedNodes,
      diff
    );

    const normalizedPoint: NormalizedExecutionPoint = {
      step: i,
      line: rawEp.line,
      funcName: rawEp.funcName,
      codeText: rawEp.codeText || '',
      stdout: rawEp.stdout || '',
      event: rawEp.event,
      snapshotConvention: rawEp.snapshotConvention || 'before-statement',
      stackToRender: stackFrames,
      heap: heap,
      dsa: {
        nodes: allOrderedNodes,
        mainChain,
        detachedNodes,
        unreachableNodes,
        freedNodes,
        pointers,
        diff,
        vietnameseExplanation: explanation,
        advancedNotes: advanced
      }
    };

    normalized.push(normalizedPoint);
    prevPoint = normalizedPoint;
  }

  return normalized;
}

export function generateVietnameseExplanation(
  codeText: string,
  line: number,
  funcName: string,
  pointers: DsaPointer[],
  nodes: DsaNode[],
  diff: DsaDiff
): { explanation: string; advanced: string } {
  let explanation = '';
  let advanced = '';

  const trimmed = codeText.trim();

  // Explain deallocation (freedNodes)
  if (diff.freedNodes.length > 0) {
    const freedAddr = diff.freedNodes[0];
    explanation = `Đã thực thi giải phóng bộ nhớ (deallocation): Vùng nhớ Heap tại địa chỉ ${freedAddr} đã được trả lại cho hệ điều hành.`;
    advanced = `Hàm delete hoàn tất thu hồi khối nhớ. Nếu các con trỏ trỏ tới ${freedAddr} chưa được gán nullptr, chúng đã trở thành con trỏ lơ lửng (dangling pointer).`;
    return { explanation, advanced };
  }

  // Pre-delete line
  if (trimmed.startsWith('delete ')) {
    const varName = trimmed.replace('delete ', '').replace(';', '').trim();
    const ptr = pointers.find(p => p.name === varName);
    explanation = `Chuẩn bị giải phóng bộ nhớ qua lệnh: ${trimmed}. Con trỏ ${varName} đang giữ địa chỉ ${ptr?.targetAddress || '???'}.`;
    advanced = `Ngữ nghĩa trước câu lệnh: Bộ nhớ tại địa chỉ trên vẫn hợp lệ và có thể truy xuất cho đến khi lệnh delete được hoàn tất ở bước kế tiếp.`;
    return { explanation, advanced };
  }

  // Pointer unlinking
  if (trimmed.includes('->pNext =') || trimmed.includes('.pHead =') || trimmed.includes('.pTail =')) {
    explanation = `Cập nhật liên kết con trỏ: ${trimmed}. Cấu trúc liên kết giữa các nút danh sách đang được thiết lập lại.`;
    advanced = `Thay đổi liên kết pNext làm thay đổi topo của đồ thị. Kiểm tra xem các nút bị tách rời có còn được giữ bởi con trỏ tạm nào không để tránh rò rỉ bộ nhớ.`;
    return { explanation, advanced };
  }

  // CreateNode / new NODE
  if (trimmed.includes('new NODE') || trimmed.includes('CreateNode')) {
    explanation = `Cấp phát nút mới trên Heap: ${trimmed}. Một ô nhớ mới được tạo để chứa dữ liệu nút.`;
    advanced = `Toán tử new cấp phát sizeof(NODE) bytes trên Heap và trả về con trỏ địa chỉ ô nhớ.`;
    return { explanation, advanced };
  }

  // Loop traversal
  if (trimmed.startsWith('while') || trimmed.startsWith('for')) {
    const pPtr = pointers.find(p => p.name === 'p');
    explanation = `Kiểm tra điều kiện lặp: ${trimmed}. Con trỏ duyệt p đang ở địa chỉ ${pPtr?.targetAddress || 'nullptr'}.`;
    advanced = `Nếu p != nullptr, vòng lặp tiếp tục xử lý nút hiện tại. Khi p trỏ tới nullptr, quá trình duyệt kết thúc an toàn.`;
    return { explanation, advanced };
  }

  // Function calls
  if (trimmed.includes('TimKiemVaXoa')) {
    explanation = `Bắt đầu thực thi thuật toán Tìm Kiếm Và Xóa (TimKiemVaXoa) trên Danh Sách Liên Kết.`;
    advanced = `Hàm nhận tham chiếu danh sách LIST &L để có thể trực tiếp sửa đổi pHead và pTail khi xóa nút đầu hoặc cuối.`;
    return { explanation, advanced };
  }

  if (trimmed.includes('PrintList')) {
    explanation = `Gọi hàm in các phần tử trong danh sách liên kết ra console.`;
    advanced = `Duyệt tuần tự từ pHead tới khi gặp nullptr. Độ phức tạp thời gian O(n).`;
    return { explanation, advanced };
  }

  // General statement
  explanation = `Đang thực thi dòng ${line}: "${trimmed || '(chuyển bước)'}".`;
  advanced = `Số lượng nút còn hoạt động: ${nodes.filter(n => n.status !== 'freed').length}. Số con trỏ đang theo dõi: ${pointers.length}.`;

  return { explanation, advanced };
}
