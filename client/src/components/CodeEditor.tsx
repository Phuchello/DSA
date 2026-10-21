import React, { useState, useEffect, useRef, useMemo } from 'react';
import CodeMirror, { ReactCodeMirrorRef, Extension } from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, Decoration } from '@codemirror/view';
import { Terminal, Code, FileText, AlertTriangle, AlertCircle } from 'lucide-react';
import type { TerminationStatus } from '../types';

interface CodeEditorProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  stdin: string;
  onChangeStdin: (newStdin: string) => void;
  currentLine: number | null;
  stdout: string;
  finalStdout?: string;
  buildOutput?: string;
  isExecuting: boolean;
  isTraceStale?: boolean;
  terminationStatus?: TerminationStatus;
  terminationReason?: string;
}

const customEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: '#090d16 !important',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: '1.6',
  },
  '.cm-gutters': {
    backgroundColor: '#070a13',
    color: '#64748b',
    borderRight: '1px solid #1e293b',
    userSelect: 'none',
    minWidth: '40px',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#cbd5e1',
  },
  '.cm-execution-highlight': {
    backgroundColor: 'rgba(59, 130, 246, 0.22) !important',
    borderLeft: '4px solid #3b82f6 !important',
    fontWeight: '600',
  },
  '.cm-execution-highlight-stale': {
    backgroundColor: 'rgba(245, 158, 11, 0.15) !important',
    borderLeft: '4px solid #f59e0b !important',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

function createExecutionLineExtension(lineNo: number | null, isStale: boolean): Extension {
  if (!lineNo || lineNo < 1) return [];

  const lineDeco = Decoration.line({
    attributes: {
      class: isStale ? 'cm-execution-highlight-stale' : 'cm-execution-highlight',
    },
  });

  return EditorView.decorations.compute(['doc'], (state) => {
    if (lineNo < 1 || lineNo > state.doc.lines) return Decoration.none;
    const line = state.doc.line(lineNo);
    return Decoration.set([lineDeco.range(line.from)]);
  });
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChangeCode,
  stdin,
  onChangeStdin,
  currentLine,
  stdout,
  finalStdout = '',
  buildOutput,
  isExecuting,
  isTraceStale = false,
  terminationStatus,
  terminationReason = '',
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'stdin'>('code');
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Auto scroll to active executing line in CodeMirror
  useEffect(() => {
    if (editorRef.current?.view && currentLine && currentLine > 0) {
      const view = editorRef.current.view;
      if (currentLine <= view.state.doc.lines) {
        const lineInfo = view.state.doc.line(currentLine);
        view.dispatch({
          effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
        });
      }
    }
  }, [currentLine]);

  const extensions = useMemo(() => {
    return [
      cpp(),
      oneDark,
      customEditorTheme,
      createExecutionLineExtension(currentLine, isTraceStale),
    ];
  }, [currentLine, isTraceStale]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Tab Header */}
      <div className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 border-b border-slate-800">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('code')}
            data-testid="tab-code"
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
            data-testid="tab-stdin"
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
          <div
            className={`text-[11px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
              isTraceStale
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            }`}
          >
            {isTraceStale ? (
              <span>Vết cũ (Dòng: {currentLine})</span>
            ) : (
              <span>Đang thực thi dòng: {currentLine}</span>
            )}
          </div>
        )}
      </div>

      {/* Stale Trace Warning Banner */}
      {isTraceStale && (
        <div
          data-testid="stale-trace-banner"
          className="bg-amber-950/40 border-b border-amber-800/50 px-3 py-1.5 text-xs text-amber-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
            <span>
              Mã nguồn hoặc stdin đã được chỉnh sửa. Vết thực thi hiện tại không còn khớp với mã mới.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Cần chạy lại
          </span>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 overflow-hidden relative font-mono text-xs">
        {activeTab === 'code' ? (
          <div className="h-full w-full" data-testid="codemirror-wrapper">
            <CodeMirror
              ref={editorRef}
              value={code}
              height="100%"
              extensions={extensions}
              onChange={(value) => onChangeCode(value)}
              readOnly={isExecuting}
              theme={oneDark}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightSpecialChars: true,
                history: true,
                foldGutter: true,
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true,
                completionKeymap: true,
                lintKeymap: true,
              }}
            />
          </div>
        ) : (
          <div className="p-3 h-full flex flex-col bg-slate-950">
            <label className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Nội dung cung cấp cho std::cin:</span>
              <span className="text-[11px] text-slate-500">Mỗi dòng là một giá trị hoặc mảng</span>
            </label>
            <textarea
              data-testid="stdin-textarea"
              value={stdin}
              onChange={(e) => onChangeStdin(e.target.value)}
              placeholder="Ví dụ:&#10;7&#10;3 0 8 2 3 4 7&#10;3"
              className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-amber-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
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
          {terminationStatus && (
            <div
              data-testid="termination-status"
              role="status"
              className={`mb-3 rounded border px-2.5 py-2 leading-relaxed ${terminationStatus === 'normal'
                ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300'
                : terminationStatus === 'crashed' || terminationStatus === 'abnormal_exit'
                  ? 'border-red-700/50 bg-red-950/20 text-red-300'
                  : 'border-amber-700/50 bg-amber-950/20 text-amber-300'}`}
            >
              <strong>
                {terminationStatus === 'normal' && 'Chương trình kết thúc bình thường'}
                {terminationStatus === 'crashed' && 'Chương trình gặp lỗi nghiêm trọng'}
                {terminationStatus === 'abnormal_exit' && 'Chương trình thoát với mã lỗi'}
                {terminationStatus === 'interrupted' && 'Chương trình bị gián đoạn'}
                {terminationStatus === 'truncated' && 'Vết thực thi bị cắt ngắn'}
                {terminationStatus === 'timeout' && 'Chương trình vượt quá thời gian cho phép'}
              </strong>
              {terminationReason && <div className="mt-1 whitespace-pre-wrap">{terminationReason}</div>}
            </div>
          )}
          {buildOutput ? (
            <pre data-testid="console-build-error" className="text-red-400 whitespace-pre-wrap leading-relaxed">{buildOutput}</pre>
          ) : stdout || finalStdout ? (
            <div className="space-y-3">
              {stdout && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">stdout đã quan sát tại bước hiện tại</div>
                  <pre data-testid="console-stdout" className="text-emerald-400 whitespace-pre-wrap leading-relaxed">{stdout}</pre>
                </div>
              )}
              {finalStdout && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">Đầu ra cuối cùng sau khi chương trình kết thúc</div>
                  <pre data-testid="console-final-stdout" className="text-emerald-400 whitespace-pre-wrap leading-relaxed">{finalStdout}</pre>
                </div>
              )}
            </div>
          ) : (
            <span className="text-slate-600 italic">Chưa có kết quả in ra màn hình...</span>
          )}
        </div>
      </div>
    </div>
  );
};
