import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { CodeEditor } from './components/CodeEditor';
import { LinkedListCanvas } from './components/LinkedListCanvas';
import { ArrayVariablesCanvas } from './components/ArrayVariablesCanvas';
import { TimelineControls } from './components/TimelineControls';
import { EducationalBanner } from './components/EducationalBanner';
import { MemoryInspector } from './components/MemoryInspector';
import type { ExecutionResponse, Lesson, NormalizedExecutionPoint, TerminationStatus } from './types';

export const App: React.FC = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('it003-golden');
  const [code, setCode] = useState<string>('');
  const [stdin, setStdin] = useState<string>('');
  const [trace, setTrace] = useState<NormalizedExecutionPoint[]>([]);
  const [traceSource, setTraceSource] = useState<{ code: string; stdin: string } | null>(null);
  const [finalStdout, setFinalStdout] = useState<string>('');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [activeCanvasTab, setActiveCanvasTab] = useState<'linked-list' | 'arrays-variables'>('linked-list');
  const userSelectedTabRef = useRef<boolean>(false);
  const [mode, setMode] = useState<'beginner' | 'advanced'>('beginner');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [buildOutput, setBuildOutput] = useState<string>('');
  const [terminationStatus, setTerminationStatus] = useState<TerminationStatus | null>(null);
  const [terminationReason, setTerminationReason] = useState<string>('');

  const playTimerRef = useRef<any>(null);
  const latestCodeRef = useRef(code);
  const latestStdinRef = useRef(stdin);
  const latestRequestIdRef = useRef(0);

  const isTraceStale = Boolean(traceSource && (traceSource.code !== code || traceSource.stdin !== stdin));

  // Fetch pre-loaded lessons on mount
  useEffect(() => {
    fetch('/api/lessons')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.lessons && data.lessons.length > 0) {
          setLessons(data.lessons);
          const first = data.lessons[0];
          setSelectedLessonId(first.id);
          latestCodeRef.current = first.code;
          latestStdinRef.current = first.defaultStdin;
          setCode(first.code);
          setStdin(first.defaultStdin);
        }
      })
      .catch((err) => {
        console.error('Không thể tải bài học từ server:', err);
      });
  }, []);

  // When selected lesson changes, update editor
  const handleSelectLesson = (lessonId: string) => {
    latestRequestIdRef.current += 1;
    setIsRunning(false);
    setSelectedLessonId(lessonId);
    userSelectedTabRef.current = false;
    const found = lessons.find((l) => l.id === lessonId);
    if (found) {
      latestCodeRef.current = found.code;
      latestStdinRef.current = found.defaultStdin;
      setCode(found.code);
      setStdin(found.defaultStdin);
      setTrace([]);
      setTraceSource(null);
      setFinalStdout('');
      setTerminationStatus(null);
      setTerminationReason('');
      setCurrentStepIndex(0);
      setIsPlaying(false);
      setBuildOutput('');
    }
  };

  const handleCodeChange = (newCode: string) => {
    latestCodeRef.current = newCode;
    setCode(newCode);
  };

  const handleStdinChange = (newStdin: string) => {
    latestStdinRef.current = newStdin;
    setStdin(newStdin);
  };

  // Run C++ Code
  const handleRunCode = async () => {
    const requestId = ++latestRequestIdRef.current;
    const requestSnapshot = { code: latestCodeRef.current, stdin: latestStdinRef.current };
    setIsRunning(true);
    setIsPlaying(false);
    setBuildOutput('');
    setTerminationStatus(null);
    setTerminationReason('');

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestSnapshot),
      });

      const data: ExecutionResponse = await response.json();

      const requestIsCurrent = requestId === latestRequestIdRef.current
        && requestSnapshot.code === latestCodeRef.current
        && requestSnapshot.stdin === latestStdinRef.current;
      if (!requestIsCurrent) return;

      const hasTrace = Array.isArray(data.trace) && data.trace.length > 0;
      if (hasTrace) {
        // Keep any partial trace and bind it to the exact immutable request snapshot.
        setTrace(data.trace);
        setTraceSource(requestSnapshot);
        setFinalStdout(data.finalStdout || '');
        setCurrentStepIndex(0);

        // Auto-select tab if user has not explicitly clicked a tab
        if (!userSelectedTabRef.current) {
          const hasLinkedListNodes = data.trace.some(
            (step) => step.dsa && Array.isArray(step.dsa.nodes) && step.dsa.nodes.length > 0
          );
          setActiveCanvasTab(hasLinkedListNodes ? 'linked-list' : 'arrays-variables');
        }
      } else {
        setTrace([]);
        setTraceSource(null);
        setFinalStdout('');
      }

      setTerminationStatus(data.terminationStatus || null);
      setTerminationReason(data.terminationReason || '');
      setBuildOutput(!data.success || !hasTrace
        ? (data.buildOutput || 'Biên dịch hoặc chạy mã thất bại.')
        : '');
    } catch (err: any) {
      const requestIsCurrent = requestId === latestRequestIdRef.current
        && requestSnapshot.code === latestCodeRef.current
        && requestSnapshot.stdin === latestStdinRef.current;
      if (!requestIsCurrent) return;
      setBuildOutput(`Lỗi kết nối tới máy chủ: ${err?.message || err}`);
      setTerminationStatus(null);
      setTerminationReason('');
      setTrace([]);
      setTraceSource(null);
      setFinalStdout('');
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsRunning(false);
      }
    }
  };

  const handleReset = () => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  };

  // Step advancement
  const handleStepChange = useCallback(
    (step: number) => {
      if (trace.length === 0) return;
      const clamped = Math.max(0, Math.min(step, trace.length - 1));
      setCurrentStepIndex(clamped);
      if (clamped >= trace.length - 1) {
        setIsPlaying(false);
      }
    },
    [trace.length]
  );

  // Auto-play timer
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = 1000 / speed;
      playTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= trace.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying, speed, trace.length]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in textarea or code editor
      if (
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.classList.contains('cm-content')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (trace.length > 0) {
          setIsPlaying((prev) => !prev);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepChange(currentStepIndex + 1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepChange(currentStepIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStepIndex, handleStepChange, trace.length]);

  const currentStep = trace[currentStepIndex] || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header */}
      <Header
        lessons={lessons}
        selectedLessonId={selectedLessonId}
        onSelectLesson={handleSelectLesson}
        mode={mode}
        onToggleMode={() => setMode((m) => (m === 'beginner' ? 'advanced' : 'beginner'))}
        isRunning={isRunning}
        onRunCode={handleRunCode}
        onReset={handleReset}
      />

      {/* Main Workspace (Split Screen) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden relative min-h-0">
        {/* Left Panel: C++ Editor, Stdin & Terminal Drawer */}
        <div className="w-full md:w-5/12 h-1/2 md:h-full flex flex-col border-b md:border-b-0 md:border-r border-slate-800 shrink-0 min-h-0">
          <CodeEditor
            code={code}
            onChangeCode={handleCodeChange}
            stdin={stdin}
            onChangeStdin={handleStdinChange}
            currentLine={currentStep?.line || null}
            stdout={currentStep?.stdout || ''}
            finalStdout={finalStdout}
            buildOutput={buildOutput}
            isExecuting={isRunning}
            isTraceStale={isTraceStale}
            terminationStatus={terminationStatus || undefined}
            terminationReason={terminationReason}
          />
        </div>

        {/* Right Panel: Educational Explanation, Visualizer Canvas & Memory Inspector */}
        <div className="w-full md:w-7/12 h-1/2 md:h-full flex flex-col bg-slate-950 overflow-hidden relative min-h-0">
          {/* Educational Tutor Banner / Learning Explanation — Prominently placed at the top of the right panel */}
          <EducationalBanner
            explanation={
              isTraceStale
                ? '⚠️ Lưu ý: Mã nguồn đã bị thay đổi kể từ lần chạy cuối. Vết thực thi này thuộc về phiên bản mã trước đó. Bấm "Chạy chương trình" để phân tích mã mới.'
                : currentStep?.dsa.vietnameseExplanation || ''
            }
            explanationDetail={isTraceStale ? undefined : currentStep?.dsa.explanationDetail}
            advancedNotes={currentStep?.dsa.advancedNotes || ''}
            mode={mode}
            diff={currentStep?.dsa.diff}
            codeText={currentStep?.codeText}
            line={currentStep?.line}
          />

          {/* Canvas Tabs Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 shrink-0 z-10">
            <div
              className="flex items-center gap-1.5"
              role="tablist"
              aria-label="Lựa chọn khung trực quan hóa"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  userSelectedTabRef.current = true;
                  setActiveCanvasTab((prev) => (prev === 'linked-list' ? 'arrays-variables' : 'linked-list'));
                }
              }}
            >
              <button
                type="button"
                role="tab"
                id="canvas-tab-btn-linked-list"
                aria-controls="canvas-tabpanel-linked-list"
                aria-selected={activeCanvasTab === 'linked-list'}
                data-testid="canvas-tab-linked-list"
                onClick={() => {
                  userSelectedTabRef.current = true;
                  setActiveCanvasTab('linked-list');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeCanvasTab === 'linked-list'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>🔗</span>
                <span>Danh sách liên kết</span>
              </button>
              <button
                type="button"
                role="tab"
                id="canvas-tab-btn-arrays"
                aria-controls="canvas-tabpanel-arrays"
                aria-selected={activeCanvasTab === 'arrays-variables'}
                data-testid="canvas-tab-arrays"
                onClick={() => {
                  userSelectedTabRef.current = true;
                  setActiveCanvasTab('arrays-variables');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeCanvasTab === 'arrays-variables'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>📊</span>
                <span>Mảng &amp; Biến</span>
              </button>
            </div>

            {/* Stale Trace Banner */}
            {isTraceStale && (
              <div
                data-testid="stale-canvas-banner"
                className="bg-amber-900/90 border border-amber-600 text-amber-200 px-2.5 py-0.5 rounded text-xs font-semibold shadow flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Vết thực thi cũ (Mã nguồn đã đổi)</span>
              </div>
            )}
          </div>

          {/* Visualizer Canvas Body */}
          <div className="flex-1 overflow-hidden relative min-h-0">
            {activeCanvasTab === 'linked-list' ? (
              <div
                id="canvas-tabpanel-linked-list"
                role="tabpanel"
                aria-labelledby="canvas-tab-btn-linked-list"
                className="h-full w-full"
              >
                <LinkedListCanvas
                  nodes={currentStep?.dsa.nodes || []}
                  pointers={currentStep?.dsa.pointers || []}
                  listRoots={currentStep?.dsa.listRoots || []}
                  currentLine={currentStep?.line}
                />
              </div>
            ) : (
              <div
                id="canvas-tabpanel-arrays"
                role="tabpanel"
                aria-labelledby="canvas-tab-btn-arrays"
                className="h-full w-full"
              >
                <ArrayVariablesCanvas
                  stackToRender={currentStep?.stackToRender || []}
                  currentLine={currentStep?.line}
                  codeText={currentStep?.codeText}
                  isTraceStale={isTraceStale}
                  previousStackToRender={
                    currentStepIndex > 0 ? trace[currentStepIndex - 1]?.stackToRender : undefined
                  }
                  event={currentStep?.event}
                />
              </div>
            )}
          </div>

          {/* Advanced Mode: Memory Inspector */}
          {mode === 'advanced' && currentStep && (
            <MemoryInspector
              stackToRender={currentStep.stackToRender || []}
              heap={currentStep.heap || {}}
            />
          )}
        </div>
      </div>

      {/* Timeline Controls Bottom Bar */}
      <TimelineControls
        currentStep={currentStepIndex}
        totalSteps={trace.length}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepChange={handleStepChange}
        onReset={handleReset}
        speed={speed}
        onChangeSpeed={setSpeed}
        currentLine={currentStep?.line}
        funcName={currentStep?.funcName}
      />
    </div>
  );
};

export default App;
