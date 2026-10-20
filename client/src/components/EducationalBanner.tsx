import React from 'react';
import { Sparkles, Info, ShieldAlert, GitCommit, ArrowRight } from 'lucide-react';
import { DsaDiff } from '../types';

interface EducationalBannerProps {
  explanation: string;
  advancedNotes: string;
  mode: 'beginner' | 'advanced';
  diff?: DsaDiff;
  codeText?: string;
  line?: number;
}

export const EducationalBanner: React.FC<EducationalBannerProps> = ({
  explanation,
  advancedNotes,
  mode,
  diff,
  codeText,
  line,
}) => {
  const hasChanges =
    diff &&
    (diff.changedVariables.length > 0 ||
      diff.allocatedNodes.length > 0 ||
      diff.freedNodes.length > 0 ||
      diff.pointerReroutes.length > 0);

  return (
    <div className="bg-slate-900 border-t border-slate-800 px-6 py-3.5 select-none transition-colors">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Main Explanation */}
        <div className="flex items-start space-x-3 flex-1">
          <div
            className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
              mode === 'beginner'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
            }`}
          >
            {mode === 'beginner' ? <Sparkles className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          </div>

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {mode === 'beginner' ? 'Sư phạm IT003 (Tập sự)' : 'Góc nhìn Chuyên sâu (Advanced)'}
              </span>
              {line && codeText && (
                <span className="text-xs font-mono text-slate-400">
                  Dòng {line}: <code className="text-blue-300 font-semibold">{codeText}</code>
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-slate-100 leading-relaxed">
              {explanation || 'Bắt đầu chạy hoặc nhấn "Tiến" để theo dõi từng bước biến đổi của cấu trúc dữ liệu.'}
            </p>

            {mode === 'advanced' && advancedNotes && (
              <p className="text-xs text-purple-300 flex items-center gap-1.5 pt-0.5">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{advancedNotes}</span>
              </p>
            )}
          </div>
        </div>

        {/* Diff Badge / Changes in this step */}
        {hasChanges && diff && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono">
            <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold">
              <GitCommit className="w-3.5 h-3.5 text-blue-400" />
              <span>Biến đổi:</span>
            </div>

            {diff.allocatedNodes.map((addr) => (
              <span
                key={addr}
                className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px]"
              >
                + new NODE ({addr})
              </span>
            ))}

            {diff.freedNodes.map((addr) => (
              <span
                key={addr}
                className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded text-[11px]"
              >
                - delete ({addr})
              </span>
            ))}

            {diff.pointerReroutes.map((r, i) => (
              <span
                key={i}
                className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
              >
                <span>{r.pointer}</span>
                <ArrowRight className="w-2.5 h-2.5" />
                <span>{r.to || 'null'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
