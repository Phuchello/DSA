export interface DsaNode {
  id: string;
  address: string;
  info: number | string | null;
  nextAddress: string | null;
  status: 'allocated' | 'freed' | 'orphan';
}

export interface DsaPointer {
  name: string;
  targetAddress: string | null;
  state: 'valid' | 'null' | 'freed' | 'dangling' | 'uninitialized';
  varAddress?: string;
  color?: string;
}

export interface DsaDiff {
  changedVariables: string[];
  allocatedNodes: string[];
  freedNodes: string[];
  pointerReroutes: Array<{ pointer: string; from: string | null; to: string | null }>;
}

export interface NormalizedExecutionPoint {
  step: number;
  line: number;
  funcName: string;
  codeText: string;
  stdout: string;
  event: string;
  stackToRender: any[];
  heap: Record<string, any>;
  dsa: {
    nodes: DsaNode[];
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
  tail: '#8B5CF6'
};

function extractInfo(cStruct: any): number | string | null {
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

function extractNextAddress(cStruct: any): string | null {
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

export function normalizeTrace(rawTrace: any[]): NormalizedExecutionPoint[] {
  const normalized: NormalizedExecutionPoint[] = [];
  const knownAllocations = new Set<string>();
  const deletedSet = new Set<string>();

  let prevPoint: NormalizedExecutionPoint | null = null;

  for (let i = 0; i < rawTrace.length; i++) {
    const rawEp = rawTrace[i];
    const heap = rawEp.heap || {};
    const deletedInStep = rawEp.deletedAddresses || [];
    for (const d of deletedInStep) {
      deletedSet.add(d);
    }

    // 1. Gather all heap nodes
    const nodeMap = new Map<string, DsaNode>();

    for (const [addr, rawNode] of Object.entries(heap)) {
      knownAllocations.add(addr);
      const isFreed = deletedSet.has(addr);
      const info = extractInfo(rawNode);
      const nextAddr = extractNextAddress(rawNode);

      nodeMap.set(addr, {
        id: `node_${addr}`,
        address: addr,
        info: info,
        nextAddress: nextAddr,
        status: isFreed ? 'freed' : 'allocated'
      });
    }

    // 2. Discover pointers across all stack frames
    const pointers: DsaPointer[] = [];
    const stackFrames = rawEp.stackToRender || [];

    for (const frame of stackFrames) {
      const locals = frame.encodedLocals || {};
      for (const [varName, val] of Object.entries(locals)) {
        if (!Array.isArray(val)) continue;

        // Pointer
        if (val[0] === 'C_DATA' && (val[2] === 'pointer' || val[2] === 'ref')) {
          const target = val[3] && val[3] !== '0x0' ? String(val[3]) : null;
          let state: DsaPointer['state'] = 'valid';
          if (!target || target === '0x0') {
            state = 'null';
          } else if (deletedSet.has(target)) {
            state = 'freed';
          } else if (!nodeMap.has(target)) {
            state = 'dangling';
          }

          // Avoid duplicate pointer names in inner frames if already recorded
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
                } else if (deletedSet.has(target)) {
                  state = 'freed';
                } else if (!nodeMap.has(target)) {
                  state = 'dangling';
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

    // 3. Order nodes in list traversal order starting from pHead
    const orderedNodes: DsaNode[] = [];
    const visited = new Set<string>();

    const pHeadPtr = pointers.find(p => p.name === 'L.pHead' || p.name === 'pHead');
    let currAddr = pHeadPtr?.targetAddress;

    while (currAddr && nodeMap.has(currAddr) && !visited.has(currAddr)) {
      visited.add(currAddr);
      const node = nodeMap.get(currAddr)!;
      orderedNodes.push(node);
      currAddr = node.nextAddress;
    }

    // Add any unlinked or freed or orphan nodes
    for (const [addr, node] of nodeMap.entries()) {
      if (!visited.has(addr)) {
        if (node.status === 'allocated') {
          node.status = 'orphan';
        }
        orderedNodes.push(node);
      }
    }

    // 4. Calculate diff from previous step
    const diff: DsaDiff = {
      changedVariables: [],
      allocatedNodes: [],
      freedNodes: [],
      pointerReroutes: []
    };

    if (prevPoint) {
      // Check node allocations
      for (const node of orderedNodes) {
        if (!prevPoint.dsa.nodes.some(n => n.address === node.address)) {
          diff.allocatedNodes.push(node.address);
        }
      }
      // Check node deallocations
      for (const prevNode of prevPoint.dsa.nodes) {
        const currNode = orderedNodes.find(n => n.address === prevNode.address);
        if (currNode && currNode.status === 'freed' && prevNode.status !== 'freed') {
          diff.freedNodes.push(prevNode.address);
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
      orderedNodes,
      diff
    );

    const normPoint: NormalizedExecutionPoint = {
      step: i,
      line: rawEp.line,
      funcName: rawEp.funcName,
      codeText: rawEp.codeText || '',
      stdout: rawEp.stdout || '',
      event: rawEp.event,
      stackToRender: stackFrames,
      heap: heap,
      dsa: {
        nodes: orderedNodes,
        pointers: pointers,
        diff: diff,
        vietnameseExplanation: explanation,
        advancedNotes: advanced
      }
    };

    normalized.push(normPoint);
    prevPoint = normPoint;
  }

  return normalized;
}

function generateVietnameseExplanation(
  code: string,
  line: number,
  func: string,
  pointers: DsaPointer[],
  nodes: DsaNode[],
  diff: DsaDiff
): { explanation: string; advanced: string } {
  const trimmed = code.trim();

  // CreateEmptyList
  if (trimmed.includes('CreateEmptyList') || trimmed.includes('L.pHead = nullptr')) {
    return {
      explanation: 'Khởi tạo danh sách liên kết rỗng: Cả con trỏ đầu (pHead) và con trỏ cuối (pTail) đều được đặt về nullptr (0x0).',
      advanced: 'Khởi tạo bất biến (Invariant): Khi danh sách rỗng, pHead == pTail == nullptr.'
    };
  }

  // new NODE
  if (trimmed.includes('new NODE')) {
    return {
      explanation: 'Toán tử new cấp phát một vùng nhớ mới trên Heap cho một nút NODE. Địa chỉ bộ nhớ được cấp phát tự động bởi hệ điều hành.',
      advanced: 'Cấp phát động (Dynamic Allocation): Vùng nhớ Heap tồn tại độc lập với thời gian sống của hàm, chỉ được giải phóng khi gọi delete.'
    };
  }

  // Delete temp
  if (trimmed.includes('delete temp')) {
    return {
      explanation: 'Gọi delete temp: Thu hồi vùng nhớ của nút đang được con trỏ temp trỏ tới trên Heap, tránh rò rỉ bộ nhớ (Memory Leak).',
      advanced: 'Con trỏ lơ lửng (Dangling Pointer): Sau lệnh delete, biến temp trên Stack vẫn lưu giá trị địa chỉ cũ, nhưng không được phép giải phóng lần 2 hoặc truy cập (*temp).'
    };
  }

  // prev->pNext = p->pNext
  if (trimmed.includes('prev->pNext = p->pNext')) {
    return {
      explanation: 'Bắc cầu liên kết: Chuyển liên kết pNext của nút đứng trước (prev) để bỏ qua nút hiện tại (p), trỏ thẳng tới nút tiếp theo (p->pNext).',
      advanced: 'Thao tác ngắt liên kết: Giúp cô lập nút p ra khỏi mạch danh sách mà không làm đứt chuỗi liên kết của các phần tử phía sau.'
    };
  }

  // L.pHead = p->pNext or L.pHead = p
  if (trimmed.includes('L.pHead = p->pNext') || trimmed.includes('L.pHead = p')) {
    return {
      explanation: 'Cập nhật con trỏ pHead: Dịch chuyển con trỏ đầu danh sách sang nút tiếp theo.',
      advanced: 'Bảo toàn bất biến đầu danh sách: Đảm bảo pHead luôn trỏ tới nút đầu tiên hợp lệ của danh sách.'
    };
  }

  // L.pTail = prev
  if (trimmed.includes('L.pTail = prev') || trimmed.includes('L.pTail = p')) {
    return {
      explanation: 'Cập nhật con trỏ pTail: Cập nhật con trỏ cuối danh sách để chỉ đúng phần tử cuối cùng hiện tại.',
      advanced: 'Bảo toàn bất biến cuối danh sách: Đảm bảo pTail->pNext luôn là nullptr.'
    };
  }

  // p = p->pNext
  if (trimmed.includes('p = p->pNext')) {
    return {
      explanation: 'Dịch chuyển con trỏ duyệt: Cho con trỏ p tiến sang nút tiếp theo trong danh sách.',
      advanced: 'Duyệt tuần tự (Sequential Traversal): Con trỏ p di chuyển theo chuỗi địa chỉ pNext cho đến khi gặp nullptr.'
    };
  }

  // prev = p
  if (trimmed.includes('prev = p')) {
    return {
      explanation: 'Lưu vết nút trước: Gán prev bằng p để giữ vị trí nút hiện tại trước khi p bước sang nút kế tiếp.',
      advanced: 'Kỹ thuật hai con trỏ (Two Pointers): Dùng con trỏ kép (prev và p) để có thể sửa đổi liên kết của nút tiền bối khi cần xóa nút p.'
    };
  }

  // if (p->info == k)
  if (trimmed.includes('p->info == k') || trimmed.includes('== k')) {
    return {
      explanation: 'Kiểm tra giá trị: So sánh giá trị info của nút hiện tại với giá trị khóa k cần tìm và xóa.',
      advanced: 'Điều kiện rẽ nhánh: Nếu trùng khớp (info == k), tiến hành tách nút và giải phóng; ngược lại, tiếp tục duyệt qua nút sau.'
    };
  }

  // while (p != nullptr)
  if (trimmed.includes('p != nullptr') || trimmed.includes('while')) {
    return {
      explanation: 'Vòng lặp kiểm tra: Kiểm tra xem con trỏ p đã đi hết danh sách (chạm nullptr) hay chưa.',
      advanced: 'Điều kiện dừng vòng lặp: Khi p == nullptr, toàn bộ danh sách đã được kiểm tra xong an toàn.'
    };
  }

  // Default fallback
  if (func === 'TimKiemVaXoa') {
    return {
      explanation: `Đang thực thi hàm Tìm kiếm & Xóa tại dòng ${line}: "${trimmed}".`,
      advanced: 'Đang theo dõi biến và các liên kết con trỏ trong khung ngăn xếp TimKiemVaXoa.'
    };
  }

  return {
    explanation: `Thực thi dòng lệnh ${line}: "${trimmed}".`,
    advanced: `Trạng thái ngăn xếp hàm ${func}().`
  };
}
