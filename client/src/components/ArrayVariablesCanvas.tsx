import React from 'react';

export interface ArrayVariablesCanvasProps {
  stackToRender: any[];
  currentLine?: number | null;
  codeText?: string;
  isTraceStale?: boolean;
  previousStackToRender?: any[];
  event?: string;
}

interface ResolvedArray {
  varName: string;
  frameName: string;
  frameId: string;
  isCurrentFrame: boolean;
  address: string;
  elementCount: number;
  isAtCaptureLimit: boolean;
  elements: Array<{
    index: number;
    value: string | number;
    address: string;
    isMutated?: boolean;
    isUninitialized?: boolean;
    isNestedArray?: boolean;
    nestedSummary?: string;
  }>;
  associatedIndices: Array<{
    name: string;
    value: number;
    frameName: string;
  }>;
  referencedByPointers: Array<{
    name: string;
    frameId: string;
    frameName: string;
  }>;
}

interface ScalarVar {
  name: string;
  type: string;
  value: string;
  address: string;
  frameName: string;
  frameId: string;
  isCurrentFrame: boolean;
  isIndexCandidate?: boolean;
  isUninitialized?: boolean;
  isMutated?: boolean;
  isStruct?: boolean;
}

interface FrameGroup {
  frameId: string;
  funcName: string;
  frameDepth: number;
  isHighlighted: boolean;
  line?: number;
  scalars: ScalarVar[];
}

/**
 * Conservatively identifies whether codeText contains an array declaration for varName.
 * Requires a preceding C++ type specification (e.g. 'int a[5]', 'const int a[3]', 'auto a[...]').
 * Strictly rejects accesses such as 'a[0] = a[1];', 'cin >> a[i];', or 'cout << a[i];'.
 */
export function isDeclarationStatement(codeText: string | undefined | null, varName: string): boolean {
  if (!codeText) return false;
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declRegex = new RegExp(
    `\\b(?:int|char|short|long|float|double|bool|auto|unsigned|signed|size_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t)\\s+(?:const\\s+)?(?:\\*+\\s*)?\\b${escaped}\\s*\\[`
  );
  return declRegex.test(codeText);
}

export const ArrayVariablesCanvas: React.FC<ArrayVariablesCanvasProps> = ({
  stackToRender = [],
  currentLine,
  codeText,
  isTraceStale = false,
  previousStackToRender,
  event,
}) => {
  // Empty state handling
  if (!stackToRender || stackToRender.length === 0) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center p-6 text-slate-500 bg-slate-950 select-none"
        data-testid="array-variables-canvas"
      >
        <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center max-w-md">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-slate-300 font-semibold mb-1">Chưa có dữ liệu biến hoặc mảng</div>
          <div className="text-xs text-slate-500">
            Nhấn &quot;Chạy chương trình&quot; hoặc chuyển bước dòng thời gian để xem trạng thái mảng và các biến cục bộ.
          </div>
        </div>
      </div>
    );
  }

  // Active / highlighted frame is usually the innermost (or marked isHighlighted)
  const activeFrame = stackToRender.find((f: any) => f?.isHighlighted) || stackToRender[stackToRender.length - 1] || stackToRender[0];

  // 1. Collect all raw static arrays across all frames (from outermost to innermost)
  const discoveredArrays: Map<string, ResolvedArray> = new Map();
  const allScalars: ScalarVar[] = [];
  const allPointers: Array<{ name: string; targetAddress: string; frameName: string; frameId: string }> = [];

  // Previous step arrays for mutation comparison
  const previousArrayValues: Map<string, Map<number, string | number>> = new Map();
  if (previousStackToRender && Array.isArray(previousStackToRender)) {
    for (const prevFrame of previousStackToRender) {
      if (!prevFrame?.encodedLocals) continue;
      for (const [varName, val] of Object.entries<any>(prevFrame.encodedLocals)) {
        if (Array.isArray(val) && val[0] === 'C_ARRAY') {
          const arrAddr = val[1] || `${prevFrame.frameId}_${varName}`;
          const map = new Map<number, string | number>();
          val.slice(2).forEach((item: any, idx: number) => {
            if (Array.isArray(item) && item[0] === 'C_DATA') {
              map.set(idx, item[3]);
            }
          });
          previousArrayValues.set(arrAddr, map);
        }
      }
    }
  }

  // Previous step scalar values for mutation detection per frame: `${prevFrameId}::${varName}` -> rawVal
  const previousScalarValues = new Map<string, any>();
  if (previousStackToRender && Array.isArray(previousStackToRender)) {
    for (const prevFrame of previousStackToRender) {
      if (!prevFrame?.encodedLocals) continue;
      const prevFrameId = String(prevFrame.frameId ?? "");
      for (const [varName, val] of Object.entries<any>(prevFrame.encodedLocals)) {
        if (Array.isArray(val) && val[0] === "C_DATA") {
          previousScalarValues.set(`${prevFrameId}::${varName}`, val[3]);
        }
      }
    }
  }

  // Build set of previously-known array identities (frameId + varName) for uninitialized detection
  const previouslyKnownArrayKeys = new Set<string>();
  if (previousStackToRender && Array.isArray(previousStackToRender)) {
    for (const prevFrame of previousStackToRender) {
      if (!prevFrame?.encodedLocals) continue;
      const prevFrameId = String(prevFrame.frameId ?? '');
      for (const [varName, val] of Object.entries<any>(prevFrame.encodedLocals)) {
        if (Array.isArray(val) && val[0] === 'C_ARRAY') {
          previouslyKnownArrayKeys.add(`${prevFrameId}::${varName}`);
        }
      }
    }
  }

  const frameGroups: FrameGroup[] = [];
  let containsUserStructs = Boolean(
    codeText && (/\bstruct\s+[A-Za-z_]\w*/.test(codeText) || /\bBranch\b/.test(codeText))
  );

  // Traverse stack frames
  for (let fIdx = 0; fIdx < stackToRender.length; fIdx++) {
    const frame = stackToRender[fIdx];
    if (!frame || !frame.encodedLocals) continue;

    const frameName = frame.funcName || `frame_${fIdx}`;
    const frameId = String(frame.frameId || fIdx);
    const frameDepth = typeof frame.frameDepth === "number" ? frame.frameDepth : fIdx;
    const isCurrentFrame = frame === activeFrame;
    const frameLine = typeof frame.line === "number" ? frame.line : undefined;

    const currentFrameScalars: ScalarVar[] = [];

    for (const [varName, val] of Object.entries<any>(frame.encodedLocals)) {
      if (!Array.isArray(val)) continue;

      if (val[0] === 'C_ARRAY') {
        const arrAddr = val[1] || `${frameId}_${varName}`;
        const rawElements = val.slice(2);
        const count = rawElements.length;
        const prevValuesMap = previousArrayValues.get(arrAddr);

        const arrayKey = `${frameId}::${varName}`;
        const isNewInThisStep = !previouslyKnownArrayKeys.has(arrayKey);
        const isConfirmedDeclaration = isDeclarationStatement(codeText, varName);
        const isDeclarationStep = isConfirmedDeclaration && (previousStackToRender === undefined || isNewInThisStep);

        const elements = rawElements.map((item: any, idx: number) => {
          if (Array.isArray(item) && item[0] === 'C_DATA') {
            const rawVal = item[3];
            const prevVal = prevValuesMap?.get(idx);
            const isMutated = prevVal !== undefined && prevVal !== rawVal;
            if (isDeclarationStep) {
              return { index: idx, value: '?', address: item[1] || '0x0', isMutated: false, isUninitialized: true };
            }
            return {
              index: idx,
              value: rawVal !== null && rawVal !== undefined ? rawVal : '?',
              address: item[1] || '0x0',
              isMutated,
            };
          } else if (Array.isArray(item) && item[0] === 'C_ARRAY') {
            return {
              index: idx,
              value: '[...]',
              address: item[1] || '0x0',
              isNestedArray: true,
              nestedSummary: `Hàng [${item.length - 2}]`,
            };
          }
          return {
            index: idx,
            value: '?',
            address: '0x0',
          };
        });

        discoveredArrays.set(arrAddr, {
          varName,
          frameName,
          frameId,
          isCurrentFrame,
          address: arrAddr,
          elementCount: count,
          isAtCaptureLimit: count >= 50,
          elements,
          associatedIndices: [],
          referencedByPointers: [],
        });
      } else if (val[0] === 'C_STRUCT') {
        containsUserStructs = true;
        const structAddr = val[1] || '0x0';
        const structType = val[2] || 'struct';
        const fields = val.slice(3).map((f: any) => {
          const fName = f[0];
          const fVal = f[1];
          let valStr = '?';
          if (Array.isArray(fVal) && fVal[0] === 'C_DATA') {
            valStr = String(fVal[3]);
            if (fVal[2]?.includes('*') && (valStr === '0' || valStr === '0x0' || valStr === 'nullptr')) {
              valStr = 'nullptr';
            }
          }
          return `${fName}: ${valStr}`;
        });

        const scVar: ScalarVar = {
          name: varName,
          type: `struct ${structType}`,
          value: `{ ${fields.join(', ')} }`,
          address: structAddr,
          frameName,
          frameId,
          isCurrentFrame,
          isIndexCandidate: false,
          isUninitialized: false,
          isMutated: false,
          isStruct: true,
        };
        currentFrameScalars.push(scVar);
        allScalars.push(scVar);
      } else if (val[0] === 'C_DATA') {
        const varAddr = val[1] || '0x0';
        const valType = val[2] || 'unknown';
        const rawVal = val[3];

        if (typeof valType === 'string' && (valType.includes('Branch') || (valType.endsWith('*') && !['int*', 'char*', 'double*', 'float*', 'bool*', 'void*', 'NODE*'].includes(valType)))) {
          containsUserStructs = true;
        }

        if (valType === 'pointer' || valType === 'NODE*') {
          allPointers.push({
            name: varName,
            targetAddress: String(rawVal || ''),
            frameName,
            frameId,
          });
        } else {
          const isNumeric = typeof rawVal === 'number' && !Number.isNaN(rawVal);
          const isUninitialized = valType === 'uninitialized' || rawVal === '?' || rawVal === null || rawVal === undefined;
          const prevScalarVal = previousScalarValues.get(`${frameId}::${varName}`);
          const isMutated = prevScalarVal !== undefined && prevScalarVal !== rawVal;

          const scVar: ScalarVar = {
            name: varName,
            type: valType,
            value: rawVal !== null && rawVal !== undefined ? String(rawVal) : '?',
            address: varAddr,
            frameName,
            frameId,
            isCurrentFrame,
            isIndexCandidate: isNumeric && rawVal >= 0,
            isUninitialized,
            isMutated,
          };
          currentFrameScalars.push(scVar);
          allScalars.push(scVar);
        }
      }
    }

    frameGroups.push({
      frameId,
      funcName: frameName,
      frameDepth,
      isHighlighted: isCurrentFrame,
      line: frameLine,
      scalars: currentFrameScalars,
    });
  }

  const framesInStackOrder = [...frameGroups].reverse();

  // Evidenced push / pop transition indicator based on runtime semantics and shared-prefix frame continuity
  let transitionNotice: { type: 'push' | 'pop'; text: string } | null = null;
  if (previousStackToRender && Array.isArray(previousStackToRender) && stackToRender && Array.isArray(stackToRender)) {
    const prevCount = previousStackToRender.length;
    const currCount = stackToRender.length;

    let sharedPrefix = 0;
    while (
      sharedPrefix < prevCount &&
      sharedPrefix < currCount &&
      previousStackToRender[sharedPrefix]?.frameId &&
      stackToRender[sharedPrefix]?.frameId &&
      previousStackToRender[sharedPrefix].frameId === stackToRender[sharedPrefix].frameId
    ) {
      sharedPrefix++;
    }

    const isEvidencedExtension =
      (event === 'call' && currCount > prevCount) ||
      (currCount > prevCount && sharedPrefix === prevCount);

    const isEvidencedContraction =
      (event === 'return' && currCount < prevCount) ||
      (currCount < prevCount && sharedPrefix === currCount);

    if (isEvidencedExtension) {
      transitionNotice = {
        type: 'push',
        text: `Gọi hàm — thêm khung (+${currCount - prevCount})`,
      };
    } else if (isEvidencedContraction) {
      transitionNotice = {
        type: 'pop',
        text: `Trở về hàm gọi — giảm số khung (-${prevCount - currCount})`,
      };
    }
  }

  // Pointer Decay Resolution
  for (const ptr of allPointers) {
    if (ptr.targetAddress && ptr.targetAddress !== '0x0' && discoveredArrays.has(ptr.targetAddress)) {
      const targetArray = discoveredArrays.get(ptr.targetAddress)!;
      if (!targetArray.referencedByPointers.some(p => p.name === ptr.name && p.frameId === ptr.frameId)) {
        targetArray.referencedByPointers.push({
          name: ptr.name,
          frameId: ptr.frameId,
          frameName: ptr.frameName,
        });
      }
    }
  }

  // Conservative Array Index Annotations
  const KNOWN_INDEX_NAMES = new Set(['i', 'j', 'k', 'left', 'right', 'mid', 'idx', 'pos']);

  const arrayAddrsReferencedByFrame = new Map<string, Set<string>>();
  for (const a of discoveredArrays.values()) {
    for (const ref of a.referencedByPointers) {
      if (!arrayAddrsReferencedByFrame.has(ref.frameId)) {
        arrayAddrsReferencedByFrame.set(ref.frameId, new Set());
      }
      arrayAddrsReferencedByFrame.get(ref.frameId)!.add(a.address);
    }
  }

  discoveredArrays.forEach((arr) => {
    const candidateScalars = allScalars.filter((sc) => {
      if (!sc.isIndexCandidate) return false;
      if (!KNOWN_INDEX_NAMES.has(sc.name.toLowerCase())) return false;

      const isInSameFrame = sc.frameId === arr.frameId;
      const arraysInSameFrame = Array.from(discoveredArrays.values()).filter(a => a.frameId === arr.frameId).length;
      const sameFrameIsUnambiguous = isInSameFrame && arraysInSameFrame === 1;

      const isReferencedByScFrame = arr.referencedByPointers.some(p => p.frameId === sc.frameId);
      const totalArraysReferencedByScFrame = arrayAddrsReferencedByFrame.get(sc.frameId)?.size || 0;
      const referencingFrameIsUnambiguous = isReferencedByScFrame && totalArraysReferencedByScFrame === 1;

      return sameFrameIsUnambiguous || referencingFrameIsUnambiguous;
    });

    for (const sc of candidateScalars) {
      const idxVal = parseInt(sc.value, 10);
      if (!Number.isNaN(idxVal) && idxVal >= 0 && idxVal < arr.elementCount) {
        if (!arr.associatedIndices.some(item => item.name === sc.name && item.frameName === sc.frameName)) {
          arr.associatedIndices.push({
            name: sc.name,
            value: idxVal,
            frameName: sc.frameName,
          });
        }
      }
    }
  });

  const arrayList = Array.from(discoveredArrays.values());

  return (
    <div
      className="h-full w-full bg-slate-950 text-slate-100 flex flex-col overflow-auto p-3 sm:p-4 space-y-5 font-mono select-none"
      data-testid="array-variables-canvas"
    >
      {/* Before-statement educational snapshot banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2 text-xs flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center space-x-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-slate-300 font-semibold">
            Quy ước trước câu lệnh (Before-Statement):
          </span>
          <span className="text-slate-400">
            Trạng thái trước khi chạy dòng này — Dòng {currentLine || '?'} chuẩn bị được thực thi. Dữ liệu bên dưới phản ánh giá trị trước khi dòng này chạy.
          </span>
        </div>
        {isTraceStale && (
          <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
            Vết cũ (Mã nguồn đã đổi)
          </span>
        )}
      </div>

      {/* Honest notice for user-defined structs (e.g. Branch) */}
      {containsUserStructs && (
        <div
          data-testid="unknown-struct-notice"
          className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 text-xs text-slate-300 flex items-start gap-2.5 shrink-0"
        >
          <span className="text-blue-400 text-sm mt-0.5">ℹ️</span>
          <div>
            <div className="font-semibold text-slate-200">Cấu trúc dữ liệu tự định nghĩa (User-defined struct)</div>
            <div className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
              Đang hiển thị các trường dữ liệu và khung hàm quan sát được từ bộ nhớ. Hệ thống chưa hỗ trợ sơ đồ cây/đồ thị chuyên biệt cho kiểu dữ liệu này (không suy diễn cấu trúc khi chưa có dữ liệu quan sát xác thực).
            </div>
          </div>
        </div>
      )}

      {/* 1D Static Arrays Section — Only rendered when static arrays exist */}
      {arrayList.length > 0 && (
        <div className="space-y-3 shrink-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-200">Mảng tĩnh 1 chiều (1D Arrays)</span>
              <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">
                {arrayList.length} mảng
              </span>
            </div>
            {arrayList.some((a) => a.isAtCaptureLimit) && (
              <span
                className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800 px-2 py-0.5 rounded"
                data-testid="capture-limit-note"
              >
                ℹ️ 50 phần tử đã ghi nhận — giới hạn thu thập
              </span>
            )}
          </div>

          {arrayList.map((arr) => (
            <div
              key={arr.address}
              className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3"
              data-testid={`array-container-${arr.varName}`}
            >
              {/* Array Header */}
              <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-emerald-400 text-sm">{arr.varName}</span>
                  <span
                    className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
                    data-testid={`array-size-badge-${arr.varName}`}
                  >
                    {arr.isAtCaptureLimit
                      ? '[≥50 phần tử (thu thập 50)]'
                      : `[${arr.elementCount} phần tử]`}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    trong {arr.frameName}() @{arr.address}
                  </span>
                </div>
                {arr.referencedByPointers.length > 0 && (
                  <div className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
                    Tham chiếu từ con trỏ: {arr.referencedByPointers.map((p) => `${p.name} (${p.frameName})`).join(', ')}
                  </div>
                )}
              </div>

              {/* Array Cells Grid */}
              <div className="overflow-x-auto pb-2 pt-1">
                <div className="inline-flex space-x-2 min-w-full items-start">
                  {arr.elements.map((elem) => {
                    const pointersHere = arr.associatedIndices.filter((p) => p.value === elem.index);

                    return (
                      <div
                        key={elem.index}
                        className="flex flex-col items-center flex-shrink-0"
                        data-testid={`array-cell-${elem.index}`}
                      >
                        {/* Index Number */}
                        <span className="text-[10px] text-slate-500 font-medium mb-1">
                          [{elem.index}]
                        </span>

                        {/* Cell Value Box */}
                        <div
                          className={`w-14 h-12 rounded-lg border flex flex-col items-center justify-center font-bold text-sm transition-colors ${
                            elem.isUninitialized
                              ? 'border-slate-600 bg-slate-800/60 text-slate-500'
                              : elem.isMutated
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 shadow-sm shadow-amber-500/30'
                              : 'border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-500'
                          }`}
                          title={elem.isUninitialized ? 'Giá trị chưa được khởi tạo (trước khi lệnh khai báo chạy)' : undefined}
                          data-testid-uninit={elem.isUninitialized ? 'true' : undefined}
                        >
                          <span className={`truncate max-w-[50px] ${elem.isUninitialized ? 'italic text-slate-400' : ''}`}>
                            {elem.value}
                          </span>
                          {elem.isUninitialized && (
                            <span className="text-[9px] text-slate-400 font-normal" data-testid="uninitialized-indicator">
                              chưa khởi tạo
                            </span>
                          )}
                          {elem.isNestedArray && (
                            <span className="text-[9px] text-slate-400 font-normal">{elem.nestedSummary}</span>
                          )}
                        </div>

                        {/* Element address */}
                        <span className="text-[8px] text-slate-600 mt-0.5 truncate max-w-[56px]">
                          {elem.address}
                        </span>

                        {/* Positional Index Badges */}
                        {pointersHere.length > 0 && (
                          <div className="mt-1 flex flex-col items-center space-y-0.5">
                            <span className="text-blue-400 text-xs leading-none">▲</span>
                            {pointersHere.map((p) => (
                              <span
                                key={`${p.frameName}_${p.name}`}
                                className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded shadow-sm"
                                data-testid={`index-badge-${p.name}`}
                              >
                                {p.name}={p.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Call Stack & Scalar Variables Section */}
      <div className="space-y-3 pt-1" data-testid="call-stack-section">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-slate-200">
              {stackToRender.length > 1
                ? 'Ngăn xếp Gọi hàm (Call Stack — LIFO) — Các hàm đang được gọi'
                : 'Các biến đang theo dõi (Scalar Variables)'}
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded" data-testid="stack-frame-count">
              {stackToRender.length} khung lệnh
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
              {allScalars.length} biến
            </span>
          </div>

          {/* Neutral Push/Pop Transition indicator */}
          {transitionNotice && (
            <div className="flex items-center">
              <span
                className={`flex items-center space-x-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                  transitionNotice.type === 'push'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
                data-testid="stack-transition-indicator"
              >
                <span>{transitionNotice.type === 'push' ? '▲' : '▼'}</span>
                <span>{transitionNotice.text}</span>
              </span>
            </div>
          )}
        </div>

        {/* Frames rendering in LIFO Stack Order (Top/Innermost active frame on top, Bottom/Outermost caller at bottom) */}
        {framesInStackOrder.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-800/80 bg-slate-900/20 text-center text-xs text-slate-500">
            Không có biến vô hướng nào trong các khung lệnh hiện tại.
          </div>
        ) : (
          <div className="space-y-3">
            {framesInStackOrder.map((group, gIdx) => {
              const isTop = gIdx === 0 && stackToRender.length > 1;
              const isBottom = gIdx === framesInStackOrder.length - 1 && stackToRender.length > 1;

              return (
                <React.Fragment key={`${group.frameId}_${group.frameDepth}`}>
                  {/* Frame Card */}
                  <div
                    className={`rounded-xl border p-3 transition-all ${
                      group.isHighlighted
                        ? 'border-blue-500/70 bg-gradient-to-br from-blue-950/30 via-slate-900/80 to-slate-950 ring-1 ring-blue-500/30 shadow-md shadow-blue-950/30'
                        : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700/80'
                    }`}
                    data-testid={`call-stack-frame-${group.frameDepth}`}
                    data-frame-id={group.frameId}
                  >
                    {/* Frame Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/70 pb-2 mb-2 flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        {group.isHighlighted ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-600" />
                        )}
                        <span className="font-bold text-sm text-slate-100 font-mono">
                          {group.funcName}()
                        </span>
                        {group.isHighlighted && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
                            Hàm đang thực hiện — Đang thực thi (Active)
                          </span>
                        )}
                        {isTop && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold">
                            ĐỈNH NGĂN XẾP (TOP)
                          </span>
                        )}
                        {isBottom && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded font-bold">
                            ĐÁY NGĂN XẾP (BOTTOM)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono">
                        {group.line && (
                          <span className="text-blue-400 text-[11px]">Dòng {group.line}</span>
                        )}
                        <span className="text-[10px] bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded">
                          Độ sâu #{group.frameDepth}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          ID: {group.frameId}
                        </span>
                      </div>
                    </div>

                    {/* Frame Variables Grid */}
                    {group.scalars.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic py-1">
                        (Khung không có biến cục bộ vô hướng)
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {group.scalars.map((sc) => (
                          <div
                            key={`${sc.frameId}_${sc.name}`}
                            className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between space-y-1 transition-colors ${
                              sc.isMutated
                                ? 'border-amber-400 bg-amber-500/10 shadow-sm shadow-amber-500/20'
                                : sc.isCurrentFrame
                                ? 'border-blue-900/80 bg-blue-950/20'
                                : 'border-slate-800 bg-slate-950/60 text-slate-400'
                            }`}
                            data-testid={`scalar-var-${sc.name}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-blue-300 truncate max-w-[120px]" title={sc.name}>
                                {sc.name}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate max-w-[100px]" title={sc.type}>
                                ({sc.type})
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 gap-1">
                              <div className="flex items-center space-x-1 min-w-0">
                                <span
                                  className={`text-sm font-semibold truncate ${
                                    sc.isUninitialized ? 'italic text-slate-400' : 'text-slate-100'
                                  }`}
                                  title={sc.value}
                                >
                                  {sc.value}
                                </span>
                                {sc.isUninitialized && (
                                  <span
                                    className="text-[9px] text-slate-500 whitespace-nowrap"
                                    data-testid="uninitialized-indicator"
                                  >
                                    chưa khởi tạo
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">
                                {sc.frameName}()
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Visual LIFO Call Link connector between stacked frames */}
                  {gIdx < framesInStackOrder.length - 1 && (
                    <div className="flex items-center justify-center py-0.5 text-slate-600 text-xs select-none">
                      <span className="flex items-center space-x-1 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded-full text-[10px] text-slate-400 font-mono shadow-sm">
                        <span>▲</span>
                        <span>được gọi bởi (called by)</span>
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArrayVariablesCanvas;
