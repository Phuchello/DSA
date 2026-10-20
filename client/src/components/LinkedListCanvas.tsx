import React from 'react';
import { DsaNode, DsaPointer } from '../types';
import { ArrowRight, Trash2, AlertCircle, CheckCircle2, CornerDownRight } from 'lucide-react';

interface LinkedListCanvasProps {
  nodes: DsaNode[];
  pointers: DsaPointer[];
  currentLine?: number;
}

export const LinkedListCanvas: React.FC<LinkedListCanvasProps> = ({
  nodes,
  pointers,
}) => {
  // Pointers pointing to nullptr
  const nullPointers = pointers.filter((p) => p.state === 'null');

  // Group pointers by target address
  const pointersByTarget = new Map<string, DsaPointer[]>();
  pointers.forEach((p) => {
    if (p.targetAddress && p.targetAddress !== '0x0') {
      const existing = pointersByTarget.get(p.targetAddress) || [];
      existing.push(p);
      pointersByTarget.set(p.targetAddress, existing);
    }
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 overflow-auto">
      {/* Canvas Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800 select-none">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <span>Sơ đồ Danh sách liên kết đơn (Singly Linked List)</span>
            <span className="text-xs font-mono font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Số nút: {nodes.filter((n) => n.status !== 'freed').length}
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
            <span>temp (Chuẩn bị xóa)</span>
          </div>
        </div>
      </div>

      {/* Main Node Chain Diagram */}
      <div className="flex-1 flex flex-col justify-center min-h-[280px]">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 text-center">
            <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium">Danh sách liên kết đang rỗng (pHead == pTail == nullptr)</p>
            <p className="text-xs text-slate-600 mt-1">Chưa có nút nào được cấp phát trên Heap.</p>
          </div>
        ) : (
          <div className="flex items-center gap-4 py-8 overflow-x-auto min-w-full">
            {nodes.map((node, index) => {
              const nodePointers = pointersByTarget.get(node.address) || [];
              const isFreed = node.status === 'freed';
              const isOrphan = node.status === 'orphan';

              return (
                <div key={node.id || node.address} className="flex items-center flex-shrink-0">
                  {/* Single Node Card Container */}
                  <div className="relative flex flex-col items-center">
                    {/* Floating Pointers pointing to this node */}
                    <div className="min-h-[48px] flex flex-col items-center justify-end gap-1 mb-2">
                      {nodePointers.map((ptr) => (
                        <div
                          key={ptr.name}
                          style={{ backgroundColor: ptr.color || '#3B82F6' }}
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-lg flex items-center gap-1 animate-bounce"
                        >
                          <span>{ptr.name}</span>
                          <span className="text-[9px] opacity-80">➔</span>
                        </div>
                      ))}
                    </div>

                    {/* Node Visual Box */}
                    <div
                      className={`w-44 rounded-xl border-2 transition-all duration-300 shadow-xl overflow-hidden ${
                        isFreed
                          ? 'border-red-500/60 bg-red-950/20 opacity-70 border-dashed'
                          : isOrphan
                          ? 'border-amber-500/60 bg-amber-950/20'
                          : 'border-blue-500/60 bg-slate-900 hover:border-blue-400'
                      }`}
                    >
                      {/* Node Header: Memory Address */}
                      <div
                        className={`px-3 py-1.5 text-[11px] font-mono flex items-center justify-between border-b ${
                          isFreed
                            ? 'bg-red-900/30 text-red-300 border-red-800/40'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
                        }`}
                      >
                        <span className="text-[10px] text-slate-500">Đ/C Heap:</span>
                        <span className="font-semibold">{node.address}</span>
                      </div>

                      {/* Node Body: info value */}
                      <div className="p-4 flex flex-col items-center justify-center bg-slate-900/80">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                          Dữ liệu (info)
                        </span>
                        <div
                          className={`text-3xl font-extrabold font-mono my-1 ${
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
                        {isOrphan && (
                          <span className="mt-1 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold border border-amber-500/30 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> Rời rạc / Bị cô lập
                          </span>
                        )}
                      </div>

                      {/* Node Footer: pNext pointer */}
                      <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800 text-[11px] font-mono flex items-center justify-between">
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

                  {/* Connecting Arrow between nodes */}
                  {index < nodes.length - 1 && (
                    <div className="flex items-center px-2 text-slate-600">
                      <div className="flex flex-col items-center">
                        <ArrowRight className="w-6 h-6 text-blue-500 animate-pulse" />
                        <span className="text-[9px] font-mono text-slate-500">pNext</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Final Nullptr Terminator */}
            <div className="flex items-center pl-2">
              <div className="w-20 h-16 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                <span>nullptr</span>
                <span className="text-[10px] text-slate-600">(0x0)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dock: Pointers pointing to nullptr */}
      <div className="mt-auto pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
            Các con trỏ đang giữ giá trị nullptr:
          </span>
          {nullPointers.length === 0 ? (
            <span className="text-xs text-slate-600 italic">Không có</span>
          ) : (
            <div className="flex items-center gap-2">
              {nullPointers.map((p) => (
                <span
                  key={p.name}
                  style={{ backgroundColor: p.color || '#64748B' }}
                  className="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-sm"
                >
                  {p.name} = nullptr
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
