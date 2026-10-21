import { RawExecutionPoint, RawExecutionPointSchema } from './schema.js';

export interface DsaNode {
  id: string;
  address: string;
  generation: number;
  info: number | string | null;
  nextAddress: string | null;
  status: 'allocated' | 'detached' | 'unreachable' | 'freed' | 'unknown';
  location?: 'heap' | 'stack' | 'unknown';
}

export interface DsaPointer {
  name: string;
  targetAddress: string | null;
  state: 'valid' | 'null' | 'freed' | 'dangling' | 'uninitialized' | 'unknown';
  varAddress?: string;
  color?: string;
  frameId?: string;
  frameName?: string;
  frameDepth?: number;
  displayName?: string;
}

export interface DsaListRoot {
  name: string;
  displayName: string;
  headPointer: string;
  tailPointer: string | null;
  frameId?: string;
  frameName?: string;
  frameDepth?: number;
  headAddress: string | null;
  tailAddress: string | null;
  nodes: DsaNode[];
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
    listRoots?: DsaListRoot[];
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
          listRoots: [],
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
    const stackNodes = rawEp.stackNodes || {};
    const unknownNodes = rawEp.unknownNodes || {};
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

    // 1. Discover pointer instances per frame. The source variable name alone
    // is not an identity: recursive calls and callers can all have a local "p".
    const pointers: DsaPointer[] = [];
    const stackFrames = rawEp.stackToRender || [];

    for (let frameIndex = 0; frameIndex < stackFrames.length; frameIndex++) {
      const frame = stackFrames[frameIndex];
      const locals = frame.encodedLocals || {};
      const frameId = String(frame.frameId || `${frame.funcName || 'frame'}#${frameIndex}`);
      const frameName = String(frame.funcName || 'frame');
      const frameDepth = Number.isFinite(frame.frameDepth) ? Number(frame.frameDepth) : frameIndex;
      const addPointer = (
        name: string,
        targetAddress: string | null,
        state: DsaPointer['state'],
        varAddress: string | undefined,
        color: string
      ) => {
        if (pointers.some(p => p.name === name && p.frameId === frameId && p.frameDepth === frameDepth)) return;
        pointers.push({ name, targetAddress, state, varAddress, color, frameId, frameName, frameDepth });
      };

      for (const [varName, val] of Object.entries(locals)) {
        if (!Array.isArray(val)) continue;

        if (val[0] === 'C_DATA' && val[2] === 'uninitialized') {
          addPointer(varName, null, 'uninitialized', val[1], '#94A3B8');
          continue;
        }

        if (val[0] === 'C_DATA' && (val[2] === 'pointer' || val[2] === 'ref')) {
          const target = val[3] && val[3] !== '0x0' ? String(val[3]) : null;
          let state: DsaPointer['state'] = 'valid';

          if (!target) {
            state = 'null';
          } else if (activeFreedAddresses.has(target)) {
            state = 'freed';
          } else if (heap[target] || stackNodes[target]) {
            state = 'valid';
          } else {
            // A readable address without allocation or stack-object evidence is unknown.
            state = 'unknown';
          }

          addPointer(varName, target, state, val[1], POINTER_COLORS[varName] || '#6B7280');
        }

        if (val[0] === 'C_STRUCT' && (val[2] === 'LIST' || val[2] === 'struct LIST')) {
          for (let f = 3; f < val.length; f++) {
            const field = val[f];
            if (field && (field[0] === 'pHead' || field[0] === 'pTail')) {
              const fieldName = `${varName}.${field[0]}`;
              const fData = field[1];
              if (!fData || !Array.isArray(fData) || fData[0] !== 'C_DATA') continue;

              const target = fData[3] && fData[3] !== '0x0' ? String(fData[3]) : null;
              let state: DsaPointer['state'] = 'valid';
              if (!target) state = 'null';
              else if (activeFreedAddresses.has(target)) state = 'freed';
              else if (!heap[target] && !stackNodes[target]) state = 'unknown';

              addPointer(fieldName, target, state, fData[1], POINTER_COLORS[field[0]] || '#3B82F6');
            }
          }
        }
      }
    }

    const pointerNameCounts = new Map<string, number>();
    for (const pointer of pointers) pointerNameCounts.set(pointer.name, (pointerNameCounts.get(pointer.name) || 0) + 1);
    for (const pointer of pointers) {
      pointer.displayName = (pointerNameCounts.get(pointer.name) || 0) > 1
        ? `${pointer.name}@${pointer.frameName}#${pointer.frameDepth}`
        : pointer.name;
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
        status: isFreed ? 'freed' : 'allocated',
        location: 'heap'
      });
    }

    // Stack objects and readable-but-unproven NODE addresses remain distinct
    // from confirmed heap allocations while still participating in topology.
    for (const [addr, rawNode] of Object.entries(stackNodes)) {
      if (nodeMap.has(addr)) continue;
      const gen = addressGenerations.get(addr) || 1;
      nodeMap.set(addr, {
        id: `stack_node_${addr}`,
        address: addr,
        generation: gen,
        info: extractInfo(rawNode),
        nextAddress: extractNextAddress(rawNode),
        status: 'allocated',
        location: 'stack'
      });
    }
    for (const [addr, rawNode] of Object.entries(unknownNodes)) {
      if (nodeMap.has(addr)) continue;
      nodeMap.set(addr, {
        id: `unknown_node_${addr}`,
        address: addr,
        generation: 1,
        info: extractInfo(rawNode),
        nextAddress: extractNextAddress(rawNode),
        status: 'unknown',
        location: 'unknown'
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
          status: 'freed',
          location: 'heap'
        });
      }
    }

    // 3. Multi-Root Reachability Analysis. LIST field pointers retain the
    // source variable and frame in their identities (for example first.pHead).
    const headPointers = pointers.filter(pointer => /(?:^|\.)(?:pHead|head)$/.test(pointer.name));
    const rootGroups = new Map<string, { head: DsaPointer; tail: DsaPointer | null; name: string }>();
    for (const head of headPointers) {
      const suffix = head.name.endsWith('.pHead') ? '.pHead' : head.name.endsWith('.head') ? '.head' : '';
      const name = suffix ? head.name.slice(0, -suffix.length) : head.name;
      const rootName = name || head.name;
      const key = `${head.frameId || ''}:${head.frameDepth ?? ''}:${rootName}`;
      const tailName = suffix ? `${name}.${suffix === '.head' ? 'tail' : 'pTail'}` : (head.name === 'head' ? 'tail' : 'pTail');
      const tail = pointers.find(pointer => pointer.name === tailName && pointer.frameId === head.frameId && pointer.frameDepth === head.frameDepth) || null;
      rootGroups.set(key, { head, tail, name: rootName });
    }

    const chainFrom = (rootAddress: string | null): DsaNode[] => {
      const chain: DsaNode[] = [];
      const seen = new Set<string>();
      let address = rootAddress;
      while (address && nodeMap.has(address) && !seen.has(address)) {
        const node = nodeMap.get(address)!;
        if (node.status === 'freed') break;
        seen.add(address);
        chain.push(node);
        address = node.nextAddress;
      }
      return chain;
    };

    const rootNameCounts = new Map<string, number>();
    for (const group of rootGroups.values()) rootNameCounts.set(group.name, (rootNameCounts.get(group.name) || 0) + 1);
    const listRoots: DsaListRoot[] = [...rootGroups.values()].map(({ head, tail, name }) => {
      const duplicateName = (rootNameCounts.get(name) || 0) > 1;
      const displayName = duplicateName ? `${name}@${head.frameName || 'frame'}#${head.frameDepth ?? 0}` : name;
      return {
        name,
        displayName,
        headPointer: head.displayName || head.name,
        tailPointer: tail ? (tail.displayName || tail.name) : null,
        frameId: head.frameId,
        frameName: head.frameName,
        frameDepth: head.frameDepth,
        headAddress: head.targetAddress,
        tailAddress: tail?.targetAddress || null,
        nodes: chainFrom(head.targetAddress)
      };
    });

    // Preserve the original single-list API: mainChain remains the first root.
    const mainChain = listRoots[0]?.nodes || [];
    const mainChainAddresses = new Set(mainChain.map(node => node.address));
    const listReachableAddresses = new Set(listRoots.flatMap(root => root.nodes.map(node => node.address)));

    // Other roots: any stack pointer not represented by a LIST head.
    const otherReachableAddresses = new Set<string>();
    for (const ptr of pointers) {
      if (!headPointers.includes(ptr) && ptr.targetAddress && ptr.state === 'valid' && nodeMap.has(ptr.targetAddress)) {
        let walkAddr: string | null = ptr.targetAddress;
        while (walkAddr && nodeMap.has(walkAddr) && !otherReachableAddresses.has(walkAddr)) {
          otherReachableAddresses.add(walkAddr);
          const wNode: DsaNode = nodeMap.get(walkAddr)!;
          if (wNode.status === 'freed') break;
          walkAddr = wNode.nextAddress;
        }
      }
    }

    // Classify node status without treating stack objects or unproven memory as
    // heap allocations or leaks.
    const detachedNodes: DsaNode[] = [];
    const unreachableNodes: DsaNode[] = [];
    const freedNodes: DsaNode[] = [];

    for (const [addr, node] of nodeMap.entries()) {
      if (node.status === 'freed') {
        freedNodes.push(node);
      } else if (node.location === 'unknown') {
        node.status = 'unknown';
      } else if (listReachableAddresses.has(addr)) {
        node.status = 'allocated';
      } else if (node.location === 'stack') {
        node.status = 'allocated';
      } else if (otherReachableAddresses.has(addr)) {
        node.status = 'detached';
        detachedNodes.push(node);
      } else {
        node.status = 'unreachable';
        unreachableNodes.push(node);
      }
    }

    const categorizedIds = new Set([...mainChain, ...detachedNodes, ...unreachableNodes, ...freedNodes].map(node => node.id));
    const additionalNodes = [...nodeMap.values()].filter(node => !categorizedIds.has(node.id));
    const allOrderedNodes: DsaNode[] = [
      ...mainChain,
      ...detachedNodes,
      ...unreachableNodes,
      ...freedNodes,
      ...additionalNodes
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
        if (node.location === 'heap' && !prevPoint.dsa.nodes.some(n => n.location === 'heap' && n.address === node.address && n.generation === node.generation)) {
          diff.allocatedNodes.push(node.address);
        }
      }
      // Check node deallocations
      for (const prevNode of prevPoint.dsa.nodes) {
        const currNode = allOrderedNodes.find(n => n.address === prevNode.address && n.generation === prevNode.generation);
        if (prevNode.location === 'heap' && currNode?.location === 'heap' && currNode.status === 'freed' && prevNode.status !== 'freed') {
          diff.freedNodes.push(prevNode.address);
        }
      }
      // Check unlinked nodes
      const previousListAddresses = new Set((prevPoint.dsa.listRoots || [{ nodes: prevPoint.dsa.mainChain }]).flatMap(root => root.nodes.map(node => node.address)));
      for (const address of previousListAddresses) {
        if (!listReachableAddresses.has(address)) diff.unlinkedNodes.push(address);
      }
      // Check pointer movements
      for (const ptr of pointers) {
        const prevPtr = prevPoint.dsa.pointers.find(p => p.name === ptr.name && p.frameId === ptr.frameId && p.frameDepth === ptr.frameDepth && p.frameDepth === ptr.frameDepth);
        if (prevPtr && prevPtr.targetAddress !== ptr.targetAddress) {
          diff.pointerReroutes.push({
            pointer: ptr.displayName || ptr.name,
            from: prevPtr.targetAddress,
            to: ptr.targetAddress
          });
          diff.changedVariables.push(ptr.displayName || ptr.name);
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
        listRoots,
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
    const ptr = [...pointers].reverse().find(p => p.name === varName);
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
    const pPtr = [...pointers].reverse().find(p => p.name === 'p');
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
