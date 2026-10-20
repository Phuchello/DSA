import React from 'react';

interface MemoryInspectorProps {
  stackToRender: any[];
  heap: Record<string, any>;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({
  stackToRender,
  heap,
}) => {
  return (
    <div className="h-64 border-t border-slate-800 bg-slate-950 flex flex-col md:flex-row overflow-hidden font-mono text-xs select-none">
      {/* Call Stack Frames */}
      <div className="w-full md:w-1/2 border-r border-slate-800 flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold flex items-center justify-between">
          <span>Ngăn xếp Lệnh (Call Stack Frames)</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
            {stackToRender.length} frames
          </span>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {stackToRender.map((frame, idx) => (
            <div
              key={frame.uniqueHash || idx}
              className={`p-2.5 rounded-lg border ${
                frame.isHighlighted
                  ? 'border-blue-500/50 bg-blue-950/20'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-200">
                  {frame.funcName}()
                  {frame.isHighlighted && (
                    <span className="ml-2 text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded">
                      Active
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-slate-500">FP: {frame.frameId}</span>
              </div>

              {/* Local Variables */}
              <div className="space-y-1">
                {Object.entries(frame.encodedLocals || {}).map(([varName, val]: [string, any]) => {
                  let displayVal = '?';
                  let valType = '';
                  let varAddr = '';

                  if (Array.isArray(val) && val[0] === 'C_DATA') {
                    varAddr = val[1];
                    valType = val[2];
                    displayVal = String(val[3]);
                  } else if (Array.isArray(val) && val[0] === 'C_STRUCT') {
                    varAddr = val[1];
                    valType = val[2];
                    displayVal = `{struct ${valType}}`;
                  }

                  return (
                    <div
                      key={varName}
                      className="flex items-center justify-between text-[11px] bg-slate-950/60 px-2 py-0.5 rounded"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-blue-400 font-semibold">{varName}:</span>
                        <span className="text-slate-500 text-[10px]">({valType})</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-300 font-medium">{displayVal}</span>
                        {varAddr && <span className="text-[10px] text-slate-600">@{varAddr}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heap Memory Table */}
      <div className="w-full md:w-1/2 flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold flex items-center justify-between">
          <span>Vùng nhớ Động Heap (Allocated Blocks)</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
            {Object.keys(heap).length} blocks
          </span>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {Object.keys(heap).length === 0 ? (
            <div className="p-4 text-center text-slate-600 italic">Vùng nhớ Heap đang trống</div>
          ) : (
            Object.entries(heap).map(([addr, block]: [string, any]) => {
              const isStruct = Array.isArray(block) && block[0] === 'C_STRUCT';
              const structType = isStruct ? block[2] : 'Block';

              return (
                <div
                  key={addr}
                  className="p-2 rounded border border-slate-800 bg-slate-900/50 flex flex-col space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-bold">{addr}</span>
                    <span className="text-slate-500 text-[10px]">{structType}</span>
                  </div>

                  {isStruct && (
                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 pl-2">
                      {block.slice(3).map((field: any, fi: number) => {
                        const fName = field[0];
                        const fVal = field[1];
                        const valStr =
                          fVal && Array.isArray(fVal) && fVal[0] === 'C_DATA'
                            ? String(fVal[3])
                            : '?';
                        return (
                          <span key={fi} className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {fName}: <strong className="text-slate-200">{valStr}</strong>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
