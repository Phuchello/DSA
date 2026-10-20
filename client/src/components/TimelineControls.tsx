import React from 'react';
import {
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Gauge,
} from 'lucide-react';

interface TimelineControlsProps {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepChange: (step: number) => void;
  onReset: () => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  currentLine?: number;
  funcName?: string;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  currentStep,
  totalSteps,
  isPlaying,
  onTogglePlay,
  onStepChange,
  onReset,
  speed,
  onChangeSpeed,
  currentLine,
  funcName,
}) => {
  const canGoBack = currentStep > 0;
  const canGoForward = currentStep < totalSteps - 1;

  return (
    <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 select-none">
      {/* Playback Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onStepChange(0)}
          disabled={!canGoBack}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Về bước đầu tiên"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={() => onStepChange(currentStep - 1)}
          disabled={!canGoBack}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Lùi 1 bước (Phím ←)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={onTogglePlay}
          disabled={totalSteps <= 1}
          className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1.5 shadow-md transition-all ${
            isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
          title="Tự động chạy từng bước (Phím Space)"
        >
          {isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Tạm dừng</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Phát tự động</span>
            </>
          )}
        </button>

        <button
          onClick={() => onStepChange(currentStep + 1)}
          disabled={!canGoForward}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Tiến 1 bước (Phím →)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => onStepChange(totalSteps - 1)}
          disabled={!canGoForward}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Đến bước cuối cùng"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors ml-2"
          title="Khởi tạo lại"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Slider & Progress */}
      <div className="flex-1 max-w-xl flex items-center space-x-4">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalSteps - 1)}
          value={currentStep}
          onChange={(e) => onStepChange(parseInt(e.target.value, 10))}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
        />

        <div className="font-mono text-xs text-slate-300 whitespace-nowrap min-w-[120px] text-right">
          <span className="font-bold text-blue-400">Bước {currentStep + 1}</span>
          <span className="text-slate-500"> / {totalSteps || 0}</span>
        </div>
      </div>

      {/* Speed & Function indicator */}
      <div className="flex items-center space-x-3 text-xs">
        {funcName && (
          <div className="hidden lg:flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
            <span className="text-slate-500">Hàm:</span>
            <span className="font-semibold text-emerald-400">{funcName}()</span>
            {currentLine && (
              <>
                <span className="text-slate-600">:</span>
                <span className="text-blue-400">L{currentLine}</span>
              </>
            )}
          </div>
        )}

        {/* Speed Selector */}
        <div className="flex items-center space-x-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 text-[11px] font-medium text-slate-300">
          <Gauge className="w-3.5 h-3.5 text-blue-400" />
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-1.5 py-0.5 rounded ${
                speed === s ? 'bg-blue-600 text-white font-bold' : 'hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
