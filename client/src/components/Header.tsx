import React from 'react';
import { Play, RotateCcw, BookOpen, Layers, ShieldCheck, Cpu } from 'lucide-react';
import { Lesson } from '../types';

interface HeaderProps {
  lessons: Lesson[];
  selectedLessonId: string;
  onSelectLesson: (id: string) => void;
  mode: 'beginner' | 'advanced';
  onToggleMode: () => void;
  isRunning: boolean;
  onRunCode: () => void;
  onReset: () => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  Beginner: 'Cơ bản',
  Intermediate: 'Trung bình',
  Advanced: 'Nâng cao',
};

export const Header: React.FC<HeaderProps> = ({
  lessons,
  selectedLessonId,
  onSelectLesson,
  mode,
  onToggleMode,
  isRunning,
  onRunCode,
  onReset,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 select-none shrink-0 z-20">
      {/* Brand & Subtitle */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 text-white p-1.5 rounded-lg shadow-sm shadow-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Cpu className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-1.5 flex-wrap">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">DSA FlowLab</h1>
            <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium px-1.5 py-0.2 rounded-full">
              IT003
            </span>
            <span className="hidden sm:inline-flex text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium px-1.5 py-0.2 rounded-full items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" /> GDB
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden md:block truncate">
            Trực quan hóa thực thi C++ &amp; Giải thích từng bước cho sinh viên
          </p>
        </div>
      </div>

      {/* Lesson Selector */}
      <div className="flex items-center space-x-1.5 flex-1 max-w-xs sm:max-w-sm md:max-w-md min-w-[180px]">
        <BookOpen className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <select
          value={selectedLessonId}
          onChange={(e) => onSelectLesson(e.target.value)}
          aria-label="Chọn bài học mẫu"
          className="w-full bg-slate-800/90 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer truncate"
        >
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title} [{DIFFICULTY_LABELS[lesson.difficulty] || lesson.difficulty}]
            </option>
          ))}
        </select>
      </div>

      {/* Mode Switcher & Run Actions */}
      <div className="flex items-center space-x-2 flex-wrap">
        {/* Beginner / Advanced Mode Toggle */}
        <button
          type="button"
          onClick={onToggleMode}
          title="Chuyển đổi giữa chế độ dễ hiểu và chế độ nâng cao"
          aria-label={mode === 'beginner' ? 'Chuyển sang Chế độ nâng cao' : 'Chuyển sang Chế độ dễ hiểu'}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            mode === 'beginner'
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
          }`}
        >
          <Layers className="w-3 h-3 flex-shrink-0" />
          <span className="whitespace-nowrap">{mode === 'beginner' ? 'Chế độ dễ hiểu' : 'Chế độ nâng cao'}</span>
          <span className="text-[10px] opacity-80 whitespace-nowrap">
            {mode === 'beginner' ? '(Chế độ: Tập sự)' : '(Chế độ: Chuyên sâu)'}
          </span>
        </button>

        {/* Reset Button */}
        <button
          type="button"
          onClick={onReset}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center space-x-1 transition-colors"
          title="Đặt lại trạng thái ban đầu"
          aria-label="Đặt lại trạng thái ban đầu"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Đặt lại</span>
        </button>

        {/* Run Code Button */}
        <button
          type="button"
          onClick={onRunCode}
          disabled={isRunning}
          aria-label="Chạy chương trình C++"
          className={`px-3.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all ${
            isRunning
              ? 'bg-blue-600/50 text-white cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 active:scale-95'
          }`}
        >
          {isRunning ? (
            <>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Đang biên dịch...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Chạy chương trình</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
