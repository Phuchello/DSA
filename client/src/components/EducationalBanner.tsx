import React from 'react';
import { Sparkles, Info, ShieldAlert, GitCommit, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { DsaDiff, EducationalExplanationDetail } from '../types';

interface EducationalBannerProps {
  explanation: string;
  advancedNotes: string;
  mode: 'beginner' | 'advanced';
  diff?: DsaDiff;
  codeText?: string;
  line?: number;
  explanationDetail?: EducationalExplanationDetail;
}

export const EducationalBanner: React.FC<EducationalBannerProps> = ({
  explanation,
  advancedNotes,
  mode,
  diff,
  codeText,
  line,
  explanationDetail,
}) => {
  const hasChanges =
    diff &&
    (diff.changedVariables.length > 0 ||
      diff.allocatedNodes.length > 0 ||
      diff.freedNodes.length > 0 ||
      diff.pointerReroutes.length > 0 ||
      (diff.scalarUpdates && diff.scalarUpdates.length > 0) ||
      (diff.arrayUpdates && diff.arrayUpdates.length > 0) ||
      (diff.frameTransition && diff.frameTransition.type !== 'none'));

  // Helper to format memory address safely according to mode
  const formatAddress = (addr: string | null | undefined): string => {
    if (!addr || addr === '0x0') return 'null';
    if (mode === 'beginner') return 'ô nhớ';
    return addr;
  };

  // FIX 5: Strip raw hex addresses from observed/upcoming text in Beginner mode.
  // Raw addresses (0x...) and GDB frame IDs must not appear in Beginner mode narration.
  // Preservation of exact addresses in Advanced mode and in internal trace structures is maintained.
  const sanitizeForBeginner = (text: string): string => {
    if (mode !== 'beginner') return text;
    // Replace standalone hex addresses (e.g. 0x7fffd34c) with neutral placeholder
    return text.replace(/\b0x[0-9a-fA-F]{4,}\b/g, '[ô nhớ]');
  };

  return (
    <div
      data-testid="educational-banner"
      className="bg-slate-900 border-t border-slate-800 px-6 py-3.5 select-none transition-colors"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Main Pedagogical Narration */}
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div
            className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
              mode === 'beginner'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
            }`}
          >
            {mode === 'beginner' ? <Sparkles className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            {/* Header tag and line indicator */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {mode === 'beginner' ? 'Sư phạm IT003 (Tập sự)' : 'Góc nhìn Chuyên sâu'}
              </span>
              {line && codeText && (
                <span className="text-xs font-mono text-slate-400 truncate">
                  Dòng {line}: <code className="text-blue-300 font-semibold">{codeText}</code>
                </span>
              )}
            </div>

            {/* Structured 3-Facet Educational Explanation (Task C & D) */}
            {explanationDetail ? (
              <div className="space-y-1 text-xs md:text-sm">
                {/* 1. Sắp thực hiện */}
                <div className="flex items-start gap-2" data-testid="explanation-upcoming">
                  <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                    Sắp thực hiện:
                  </span>
                  <span className="text-slate-100 font-medium leading-relaxed">
                    {sanitizeForBeginner(explanationDetail.upcoming)}
                  </span>
                </div>

                {/* 2. Thay đổi đã quan sát */}
                <div className="flex items-start gap-2" data-testid="explanation-observed">
                  <span className="text-[11px] font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                    Quan sát:
                  </span>
                  <span className="text-slate-200 leading-relaxed">
                    {sanitizeForBeginner(explanationDetail.observed)}
                  </span>
                </div>

                {/* 3. Ý nghĩa */}
                {explanationDetail.semantics && (
                  <div className="flex items-start gap-2" data-testid="explanation-semantics">
                    <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                      Ý nghĩa:
                    </span>
                    <span className="text-slate-300 text-xs leading-relaxed">
                      {explanationDetail.semantics}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-100 leading-relaxed">
                {explanation || 'Bắt đầu chạy hoặc nhấn "Tiến" để theo dõi từng bước biến đổi của cấu trúc dữ liệu.'}
              </p>
            )}

            {/* Advanced technical notes */}
            {mode === 'advanced' && advancedNotes && (
              <p className="text-xs text-purple-300 flex items-center gap-1.5 pt-0.5">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{advancedNotes}</span>
              </p>
            )}
          </div>
        </div>

        {/* Diff Badge / Observable Memory & Frame Changes */}
        {hasChanges && diff && (
          <div
            data-testid="diff-badge-container"
            className="flex flex-wrap items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono max-w-full md:max-w-md"
          >
            <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold mr-1">
              <GitCommit className="w-3.5 h-3.5 text-blue-400" />
              <span>Biến đổi:</span>
            </div>

            {/* Frame Transition Badge */}
            {diff.frameTransition && diff.frameTransition.type === 'push' && (
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>▲ Gọi {diff.frameTransition.funcName}()</span>
              </span>
            )}
            {diff.frameTransition && diff.frameTransition.type === 'pop' && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3" />
                <span>▼ Về {diff.frameTransition.funcName}()</span>
              </span>
            )}

            {/* Heap Node Allocations */}
            {diff.allocatedNodes.map((addr) => (
              <span
                key={addr}
                className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px]"
              >
                + new NODE{mode === 'advanced' ? ` (${addr})` : ''}
              </span>
            ))}

            {/* Heap Node Deallocations */}
            {diff.freedNodes.map((addr) => (
              <span
                key={addr}
                className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded text-[11px]"
              >
                - delete{mode === 'advanced' ? ` (${addr})` : ''}
              </span>
            ))}

            {/* Pointer Reroutes */}
            {diff.pointerReroutes.map((r, i) => (
              <span
                key={i}
                className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
              >
                <span>{r.pointer}</span>
                <ArrowRight className="w-2.5 h-2.5" />
                <span>{formatAddress(r.to)}</span>
              </span>
            ))}

            {/* Scalar Updates */}
            {diff.scalarUpdates &&
              diff.scalarUpdates.map((u, i) => (
                <span
                  key={`sc-${i}`}
                  className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
                >
                  <span>{u.displayName}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                  <span>{u.to}</span>
                </span>
              ))}

            {/* Array Updates */}
            {diff.arrayUpdates &&
              diff.arrayUpdates.map((a, i) => (
                <span
                  key={`arr-${i}`}
                  className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
                >
                  <span>{a.displayName}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                  <span>{a.to}</span>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
