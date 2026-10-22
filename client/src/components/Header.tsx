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
  const currentLesson = lessons.find((l) => l.id === selectedLessonId);

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4 select-none">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 text-white p-2 rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-white tracking-tight">DSA FlowLab</h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium px-2 py-0.5 rounded-full">
              Web P0
            </span>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> MinGW GDB
            </span>
          </div>
          <p className="text-xs text-slate-400">Trực quan hóa thực thi C++ thời gian thực & Cấu trúc dữ liệu IT003</p>
        </div>
      </div>

      {/* Lesson Selector */}
      <div className="flex items-center space-x-2 flex-1 max-w-md">
        <BookOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <select
          value={selectedLessonId}
          onChange={(e) => onSelectLesson(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title} [{DIFFICULTY_LABELS[lesson.difficulty] || lesson.difficulty}]
            </option>
          ))}
        </select>
      </div>

      {/* Mode Switcher & Run Actions */}
      <div className="flex items-center space-x-3">
        {/* Beginner / Advanced Mode Toggle */}
        <button
          onClick={onToggleMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            mode === 'beginner'
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
          }`}
          title="Chuyển đổi giữa chế độ Tập sự và Chuyên sâu"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{mode === 'beginner' ? 'Chế độ: Tập sự' : 'Chế độ: Chuyên sâu'}</span>
        </button>

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center space-x-1 transition-colors"
          title="Đặt lại trạng thái ban đầu"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Đặt lại</span>
        </button>

        {/* Run Code Button */}
        <button
          onClick={onRunCode}
          disabled={isRunning}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all ${
            isRunning
              ? 'bg-blue-600/50 text-white cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-95'
          }`}
        >
          {isRunning ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Đang biên dịch...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Chạy chương trình</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
