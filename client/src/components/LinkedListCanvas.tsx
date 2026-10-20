import React from 'react';
import { DsaNode, DsaPointer } from '../types';
import { ArrowRight, Trash2, AlertCircle, AlertTriangle, CornerDownRight, CheckCircle2 } from 'lucide-react';

interface LinkedListCanvasProps {
  nodes: DsaNode[];
  pointers: DsaPointer[];
  currentLine?: number;
}

export const LinkedListCanvas: React.FC<LinkedListCanvasProps> = ({
  nodes,
  pointers,
}) => {
  // Pointers grouped by target address
  const pointersByTarget = new Map<string, DsaPointer[]>();
  const specialPointers: DsaPointer[] = [];

  pointers.forEach((p) => {
    if (p.state === 'null' || p.state === 'uninitialized' || p.state === 'dangling') {
      specialPointers.push(p);
    } else if (p.targetAddress && p.targetAddress !== '0x0') {
      const existing = pointersByTarget.get(p.targetAddress) || [];
      existing.push(p);
      pointersByTarget.set(p.targetAddress, existing);
    }
  });

  // Separate nodes into real topological groups
  const nodeMap = new Map<string, DsaNode>();
  nodes.forEach((n) => nodeMap.set(n.address, n));

  // 1. Main chain starting from pHead
  const pHeadPtr = pointers.find((p) => p.name === 'L.pHead' || p.name === 'pHead' || p.name === 'head');
  const mainChain: DsaNode[] = [];
  const visitedMain = new Set<string>();

  let currAddr = pHeadPtr?.targetAddress;
  while (currAddr && nodeMap.has(currAddr) && !visitedMain.has(currAddr)) {
    const node = nodeMap.get(currAddr)!;
    if (node.status === 'freed') break;
    visitedMain.add(currAddr);
    mainChain.push(node);
    currAddr = node.nextAddress;
  }

  // 2. Detached nodes: reachable by other stack pointer, not in main chain
  const detachedNodes = nodes.filter(
    (n) => n.status === 'detached' || (!visitedMain.has(n.address) && n.status === 'allocated' && (pointersByTarget.get(n.address)?.length || 0) > 0)
  );

  // 3. Unreachable nodes: active on heap, not in main chain, no stack pointer
  const unreachableNodes = nodes.filter(
    (n) => n.status === 'unreachable' || (!visitedMain.has(n.address) && n.status === 'orphan')
  );

  // 4. Freed nodes
  const freedNodes = nodes.filter((n) => n.status === 'freed');

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 overflow-auto" data-testid="linked-list-canvas">
      {/* Canvas Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800 select-none">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <span>Sơ đồ Danh sách liên kết đơn (Singly Linked List)</span>
            <span className="text-xs font-mono font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Tổng số ô nhớ: {nodes.length} (Chuỗi chính: {mainChain.length})
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mỗi khối biểu diễn một biến struct NODE được cấp phát động trên vùng nhớ Heap
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />
            <span>pHead</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-purple-500 inline-block" />
            <span>pTail</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
            <span>p (Duyệt)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
            <span>prev (Nút trước)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />
            <span>temp (Tạm/Xóa)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {/* SECTION 1: MAIN CHAIN */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              Chuỗi Danh Sách Chính (Bắt đầu từ pHead)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              pHead: {pHeadPtr?.targetAddress || 'nullptr (0x0)'}
            </span>
          </div>

          {mainChain.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-800 rounded-lg text-slate-500 text-center">
              <AlertCircle className="w-6 h-6 text-slate-600 mb-1" />
              <p className="text-xs font-medium">Danh sách liên kết đang rỗng (pHead == nullptr)</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4 overflow-x-auto min-w-full">
              {mainChain.map((node, index) => {
                const nodePointers = pointersByTarget.get(node.address) || [];
                const nextNode = index < mainChain.length - 1 ? mainChain[index + 1] : null;
                const hasRealNextEdge = nextNode && node.nextAddress === nextNode.address;
                const pointsToNull = !node.nextAddress || node.nextAddress === '0x0';

                return (
                  <div key={node.id} className="flex items-center flex-shrink-0">
                    <NodeCard node={node} pointers={nodePointers} />

                    {/* Edge: strictly based on real pNext address */}
                    {hasRealNextEdge ? (
                      <div className="flex flex-col items-center px-2 text-slate-500 select-none">
                        <ArrowRight className="w-5 h-5 text-blue-500" />
                        <span className="text-[8px] font-mono text-blue-400">pNext</span>
                      </div>
                    ) : pointsToNull ? (
                      <div className="flex items-center pl-2 select-none">
                        <div className="flex flex-col items-center px-1 text-slate-600">
                          <ArrowRight className="w-4 h-4 text-slate-600" />
                          <span className="text-[8px] font-mono text-slate-600">pNext</span>
                        </div>
                        <div className="w-16 h-12 rounded-lg border border-dashed border-slate-800 bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono text-[11px]">
                          <span>nullptr</span>
                          <span className="text-[9px] text-slate-600">(0x0)</span>
                        </div>
                      </div>
                    ) : (
                      // Non-consecutive link (e.g. branch or cycle)
                      <div className="flex flex-col items-center px-2 text-amber-500 select-none">
                        <ArrowRight className="w-4 h-4 text-amber-400" />
                        <span className="text-[8px] font-mono text-amber-300">➔ {node.nextAddress}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: DETACHED NODES (STILL REACHABLE VIA STACK POINTER) */}
        {detachedNodes.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Nút Đã Tách Rời Chuỗi Chính (Đang Được Giữ Bởi Con Trỏ)
              </span>
              <span className="text-[11px] text-amber-300/80">
                Chưa bị rò rỉ vì vẫn có con trỏ sống trỏ tới
              </span>
            </div>

            <div className="flex items-center gap-4 py-2 overflow-x-auto min-w-full">
              {detachedNodes.map((node) => {
                const nodePointers = pointersByTarget.get(node.address) || [];
                return (
                  <div key={node.id} className="flex items-center flex-shrink-0">
                    <NodeCard node={node} pointers={nodePointers} isDetached />
                    <div className="flex items-center pl-2 select-none">
                      <div className="flex flex-col items-center px-1 text-slate-600">
                        <ArrowRight className="w-4 h-4 text-amber-500" />
                        <span className="text-[8px] font-mono text-amber-400">pNext</span>
                      </div>
                      <div className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                        {node.nextAddress || 'nullptr'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 3: UNREACHABLE NODES (MEMORY LEAKS) */}
        {unreachableNodes.length > 0 && (
          <div className="bg-orange-950/20 border border-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                Nút Bị Cô Lập / Nguy Cơ Rò Rỉ Bộ Nhớ (Unreachable Nodes)
              </span>
              <span className="text-[11px] text-orange-300">
                Không có con trỏ nào quản lý nhưng chưa gọi delete
              </span>
            </div>

            <div className="flex items-center gap-4 py-2 overflow-x-auto min-w-full">
              {unreachableNodes.map((node) => (
                <div key={node.id} className="flex items-center flex-shrink-0">
                  <NodeCard node={node} pointers={[]} isUnreachable />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 4: FREED HEAP BLOCKS */}
        {freedNodes.length > 0 && (
          <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                Vùng Nhớ Đã Thu Hồi (Freed Memory)
              </span>
              <span className="text-[11px] text-red-300/80">
                Bộ nhớ đã được trả về qua lệnh delete
              </span>
            </div>

            <div className="flex items-center gap-4 py-2 overflow-x-auto min-w-full">
              {freedNodes.map((node) => {
                const nodePointers = pointersByTarget.get(node.address) || [];
                return (
                  <div key={node.id} className="flex items-center flex-shrink-0">
                    <NodeCard node={node} pointers={nodePointers} isFreed />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DOCK: SPECIAL POINTERS (nullptr / uninitialized / dangling) */}
      <div className="mt-auto pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
            Con trỏ đặc biệt (nullptr / Dangling / Chưa khởi tạo):
          </span>
          {specialPointers.length === 0 ? (
            <span className="text-xs text-slate-600 italic">Không có con trỏ nào lơ lửng</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {specialPointers.map((p) => (
                <span
                  key={p.name}
                  style={{ backgroundColor: p.color || '#64748B' }}
                  className="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-sm flex items-center gap-1"
                >
                  <span>{p.name}:</span>
                  <span className="opacity-90 font-mono text-[10px]">
                    {p.state === 'null' ? 'nullptr (0x0)' : p.state === 'uninitialized' ? 'chưa gán (?)' : 'lơ lửng (dangling)'}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface NodeCardProps {
  node: DsaNode;
  pointers: DsaPointer[];
  isDetached?: boolean;
  isUnreachable?: boolean;
  isFreed?: boolean;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node,
  pointers,
  isDetached,
  isUnreachable,
  isFreed,
}) => {
  return (
    <div className="relative flex flex-col items-center">
      {/* Floating Pointers pointing to this node */}
      <div className="min-h-[44px] flex flex-col items-center justify-end gap-1 mb-2">
        {pointers.map((ptr) => (
          <div
            key={ptr.name}
            style={{ backgroundColor: ptr.color || '#3B82F6' }}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-lg flex items-center gap-1 ${
              ptr.state === 'freed' ? 'border-2 border-red-400 animate-pulse' : ''
            }`}
          >
            <span>{ptr.name}</span>
            <span className="text-[9px] opacity-80">➔</span>
            {ptr.state === 'freed' && (
              <span className="text-[9px] bg-red-600 px-1 rounded ml-0.5">dangling</span>
            )}
          </div>
        ))}
      </div>

      {/* Node Visual Box */}
      <div
        className={`w-40 rounded-xl border-2 transition-all duration-300 shadow-xl overflow-hidden ${
          isFreed
            ? 'border-red-500/60 bg-red-950/20 opacity-70 border-dashed'
            : isUnreachable
            ? 'border-orange-500/60 bg-orange-950/20 border-dashed'
            : isDetached
            ? 'border-amber-500/60 bg-amber-950/20'
            : 'border-blue-500/60 bg-slate-900 hover:border-blue-400'
        }`}
      >
        {/* Node Header: Memory Address */}
        <div
          className={`px-3 py-1.5 text-[11px] font-mono flex items-center justify-between border-b ${
            isFreed
              ? 'bg-red-900/30 text-red-300 border-red-800/40'
              : isUnreachable
              ? 'bg-orange-900/30 text-orange-300 border-orange-800/40'
              : isDetached
              ? 'bg-amber-900/30 text-amber-300 border-amber-800/40'
              : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
          }`}
        >
          <span className="text-[10px] text-slate-500">Đ/C Heap:</span>
          <span className="font-semibold">{node.address}</span>
        </div>

        {/* Node Body: info value */}
        <div className="p-3 flex flex-col items-center justify-center bg-slate-900/80">
          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
            Dữ liệu (info)
          </span>
          <div
            className={`text-2xl font-extrabold font-mono my-1 ${
              isFreed ? 'text-red-400 line-through' : 'text-white'
            }`}
          >
            {node.info !== null ? node.info : '?'}
          </div>
          {isFreed && (
            <span className="mt-1 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold border border-red-500/30 flex items-center gap-1">
              <Trash2 className="w-2.5 h-2.5" /> Đã delete
            </span>
          )}
          {isDetached && (
            <span className="mt-1 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold border border-amber-500/30 flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> Tách chuỗi
            </span>
          )}
          {isUnreachable && (
            <span className="mt-1 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold border border-orange-500/30 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Rò rỉ (Leak)
            </span>
          )}
        </div>

        {/* Node Footer: pNext pointer */}
        <div className="px-3 py-1.5 bg-slate-950/60 border-t border-slate-800 text-[11px] font-mono flex items-center justify-between">
          <span className="text-slate-400 font-medium">pNext:</span>
          <span
            className={`font-semibold ${
              node.nextAddress ? 'text-blue-400' : 'text-slate-500 italic'
            }`}
          >
            {node.nextAddress || 'nullptr (0x0)'}
          </span>
        </div>
      </div>
    </div>
  );
};
