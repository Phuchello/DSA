import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { CodeEditor } from './components/CodeEditor';
import { LinkedListCanvas } from './components/LinkedListCanvas';
import { TimelineControls } from './components/TimelineControls';
import { EducationalBanner } from './components/EducationalBanner';
import { MemoryInspector } from './components/MemoryInspector';
import { Lesson, NormalizedExecutionPoint } from './types';

export const App: React.FC = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('it003-golden');
  const [code, setCode] = useState<string>('');
  const [stdin, setStdin] = useState<string>('');
  const [trace, setTrace] = useState<NormalizedExecutionPoint[]>([]);
  const [isTraceStale, setIsTraceStale] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [mode, setMode] = useState<'beginner' | 'advanced'>('beginner');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [buildOutput, setBuildOutput] = useState<string>('');

  const playTimerRef = useRef<any>(null);

  // Fetch pre-loaded lessons on mount
  useEffect(() => {
    fetch('/api/lessons')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.lessons && data.lessons.length > 0) {
          setLessons(data.lessons);
          const first = data.lessons[0];
          setSelectedLessonId(first.id);
          setCode(first.code);
          setStdin(first.defaultStdin);
          setIsTraceStale(false);
        }
      })
      .catch((err) => {
        console.error('Không thể tải bài học từ server:', err);
      });
  }, []);

  // When selected lesson changes, update editor
  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    const found = lessons.find((l) => l.id === lessonId);
    if (found) {
      setCode(found.code);
      setStdin(found.defaultStdin);
      setTrace([]);
      setIsTraceStale(false);
      setCurrentStepIndex(0);
      setIsPlaying(false);
      setBuildOutput('');
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (trace.length > 0) {
      setIsTraceStale(true);
    }
  };

  const handleStdinChange = (newStdin: string) => {
    setStdin(newStdin);
    if (trace.length > 0) {
      setIsTraceStale(true);
    }
  };

  // Run C++ Code
  const handleRunCode = async () => {
    setIsRunning(true);
    setIsPlaying(false);
    setBuildOutput('');

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin }),
      });

      const data = await response.json();

      if (data.success && data.trace && data.trace.length > 0) {
        setTrace(data.trace);
        setIsTraceStale(false);
        setCurrentStepIndex(0);
        setBuildOutput('');
      } else {
        setBuildOutput(data.buildOutput || 'Biên dịch hoặc chạy mã thất bại.');
        setTrace([]);
        setIsTraceStale(false);
      }
    } catch (err: any) {
      setBuildOutput(`Lỗi kết nối tới máy chủ: ${err?.message || err}`);
      setTrace([]);
      setIsTraceStale(false);
    } finally {
      setIsRunning(false);
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
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Panel: C++ Editor, Stdin & Terminal Drawer */}
        <div className="w-full md:w-5/12 h-1/2 md:h-full flex flex-col">
          <CodeEditor
            code={code}
            onChangeCode={handleCodeChange}
            stdin={stdin}
            onChangeStdin={handleStdinChange}
            currentLine={currentStep?.line || null}
            stdout={currentStep?.stdout || ''}
            buildOutput={buildOutput}
            isExecuting={isRunning}
            isTraceStale={isTraceStale}
          />
        </div>

        {/* Right Panel: Linked List Canvas & Memory Inspector */}
        <div className="w-full md:w-7/12 h-1/2 md:h-full flex flex-col bg-slate-950 overflow-hidden relative">
          {/* Stale Trace Overlay Banner */}
          {isTraceStale && (
            <div
              data-testid="stale-canvas-banner"
              className="absolute top-2 right-4 z-20 bg-amber-900/90 border border-amber-600 text-amber-200 px-3 py-1 rounded-md text-xs font-semibold shadow-lg backdrop-blur flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Vết thực thi cũ (Mã nguồn đã đổi)</span>
            </div>
          )}

          {/* Linked List Visualizer */}
          <div className="flex-1 overflow-hidden">
            <LinkedListCanvas
              nodes={currentStep?.dsa.nodes || []}
              pointers={currentStep?.dsa.pointers || []}
              currentLine={currentStep?.line}
            />
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

      {/* Educational Tutor Banner */}
      <EducationalBanner
        explanation={
          isTraceStale
            ? '⚠️ Lưu ý: Mã nguồn đã bị thay đổi kể từ lần chạy cuối. Vết thực thi này thuộc về phiên bản mã trước đó. Bấm "Chạy mã C++" để phân tích mã mới.'
            : currentStep?.dsa.vietnameseExplanation || ''
        }
        advancedNotes={currentStep?.dsa.advancedNotes || ''}
        mode={mode}
        diff={currentStep?.dsa.diff}
        codeText={currentStep?.codeText}
        line={currentStep?.line}
      />

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
