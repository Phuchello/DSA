import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Code, FileText, AlertTriangle } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  stdin: string;
  onChangeStdin: (newStdin: string) => void;
  currentLine: number | null;
  stdout: string;
  buildOutput?: string;
  isExecuting: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChangeCode,
  stdin,
  onChangeStdin,
  currentLine,
  stdout,
  buildOutput,
  isExecuting,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'stdin'>('code');
  const codeLines = code.split('\n');
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to active executing line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentLine]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Tab Header */}
      <div className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 border-b border-slate-800">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 text-xs font-medium rounded-md flex items-center space-x-1.5 transition-colors ${
              activeTab === 'code'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Mã nguồn C++</span>
          </button>
          <button
            onClick={() => setActiveTab('stdin')}
            className={`px-3 py-1 text-xs font-medium rounded-md flex items-center space-x-1.5 transition-colors ${
              activeTab === 'stdin'
                ? 'bg-slate-800 text-amber-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Dữ liệu đầu vào (stdin)</span>
            {stdin.trim().length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>

        {currentLine && activeTab === 'code' && (
          <div className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Đang thực thi dòng: {currentLine}
          </div>
        )}
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-auto relative font-mono text-xs">
        {activeTab === 'code' ? (
          <div className="min-w-full inline-block py-2">
            {codeLines.map((lineText, idx) => {
              const lineNo = idx + 1;
              const isCurrent = lineNo === currentLine;

              return (
                <div
                  key={lineNo}
                  ref={isCurrent ? activeLineRef : null}
                  className={`flex items-center group transition-colors ${
                    isCurrent
                      ? 'bg-blue-600/20 text-white font-semibold border-l-4 border-blue-500'
                      : 'hover:bg-slate-800/40 text-slate-300 border-l-4 border-transparent'
                  }`}
                >
                  {/* Line Number & Indicator */}
                  <div className="w-12 text-right pr-3 select-none text-slate-500 text-[11px] flex-shrink-0 flex items-center justify-end space-x-1">
                    {isCurrent && <span className="text-blue-400 animate-pulse">➔</span>}
                    <span className={isCurrent ? 'text-blue-400 font-bold' : ''}>{lineNo}</span>
                  </div>

                  {/* Code Line Content */}
                  <pre className="pr-4 py-0.5 whitespace-pre leading-relaxed overflow-x-visible">
                    {lineText || ' '}
                  </pre>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 h-full flex flex-col">
            <label className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Nội dung cung cấp cho std::cin:</span>
              <span className="text-[11px] text-slate-500">Mỗi dòng là một giá trị hoặc mảng</span>
            </label>
            <textarea
              value={stdin}
              onChange={(e) => onChangeStdin(e.target.value)}
              placeholder="Ví dụ:&#10;7&#10;3 0 8 2 3 4 7&#10;3"
              className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-amber-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
          </div>
        )}
      </div>

      {/* Console Output Drawer */}
      <div className="h-44 border-t border-slate-800 bg-slate-950 flex flex-col">
        <div className="px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-300">Console Đầu ra (stdout / Trình biên dịch)</span>
          </div>
          {buildOutput && (
            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Lỗi biên dịch
            </span>
          )}
        </div>

        <div className="flex-1 p-3 overflow-auto font-mono text-xs">
          {buildOutput ? (
            <pre className="text-red-400 whitespace-pre-wrap leading-relaxed">{buildOutput}</pre>
          ) : stdout ? (
            <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed">{stdout}</pre>
          ) : (
            <span className="text-slate-600 italic">Chưa có kết quả in ra màn hình...</span>
          )}
        </div>
      </div>
    </div>
  );
};
