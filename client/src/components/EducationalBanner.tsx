import React from 'react';
import {
  Sparkles,
  Info,
  ShieldAlert,
  GitCommit,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Eye,
  Zap,
} from 'lucide-react';
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

  // Format memory address safely according to mode
  const formatAddress = (addr: string | null | undefined): string => {
    if (!addr || addr === '0x0') return 'null';
    if (mode === 'beginner') return 'ô nhớ';
    return addr;
  };

  // Strip raw hex addresses from observed/upcoming text in Beginner mode.
  const sanitizeForBeginner = (text: string): string => {
    if (mode !== 'beginner') return text;
    return text.replace(/\b0x[0-9a-fA-F]{4,}\b/g, '[ô nhớ]');
  };

  return (
    <div
      data-testid="educational-banner"
      className="bg-slate-900 border-b border-slate-800 p-3.5 sm:p-4 select-none transition-colors shrink-0"
    >
      <div className="flex flex-col gap-3">
        {/* Top Header: Mode Badge, Question Guide & Line correlation */}
        <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-slate-800/80">
          <div className="flex items-center space-x-2 flex-wrap">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 ${
                mode === 'beginner'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
              }`}
            >
              {mode === 'beginner' ? <Sparkles className="w-3 h-3" /> : <Info className="w-3 h-3" />}
              <span>{mode === 'beginner' ? 'Sư phạm IT003 (Dễ hiểu)' : 'Góc nhìn Chuyên sâu'}</span>
            </span>

            {line && codeText && (
              <span className="text-xs font-mono text-slate-300 truncate">
                Dòng <strong className="text-blue-400 font-bold">{line}</strong>:{' '}
                <code className="text-blue-300 font-semibold bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800">
                  {codeText}
                </code>
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400 hidden sm:inline-block">
            {mode === 'beginner'
              ? 'Giải thích 4 câu hỏi trọng tâm về bước thực thi'
              : 'Trạng thái bộ nhớ và con trỏ chi tiết'}
          </span>
        </div>

        {/* Structured 4-Facet Learning Explanation Card */}
        {explanationDetail ? (
          <div className="space-y-2 text-xs" data-testid="educational-explanation">
            {/* 1. Sắp thực hiện (Upcoming) */}
            <div
              className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20"
              data-testid="explanation-upcoming"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                <Zap className="w-3 h-3" />
                <span>Sắp thực hiện:</span>
              </div>
              <span className="text-slate-100 font-medium leading-relaxed">
                {sanitizeForBeginner(explanationDetail.upcoming)}
              </span>
            </div>

            {/* 2. Quan sát (Observed changes) */}
            <div
              className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/20"
              data-testid="explanation-observed"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                <Eye className="w-3 h-3" />
                <span>Quan sát:</span>
              </div>
              <span className="text-slate-200 leading-relaxed">
                {sanitizeForBeginner(explanationDetail.observed)}
              </span>
            </div>

            {/* 3. Biến đổi đã xác nhận (Observed Diff Badges) */}
            {hasChanges && diff && (
              <div
                data-testid="diff-badge-container"
                className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              >
                <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold mr-1">
                  <GitCommit className="w-3.5 h-3.5 text-blue-400" />
                  <span>Biến đổi:</span>
                </div>

                {/* Frame Transition Badge */}
                {diff.frameTransition && diff.frameTransition.type === 'push' && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 font-sans">
                    <ArrowUpRight className="w-3 h-3" />
                    <span>▲ Gọi {diff.frameTransition.funcName}()</span>
                  </span>
                )}
                {diff.frameTransition && diff.frameTransition.type === 'pop' && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 font-sans">
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
                      <span className="font-semibold text-purple-200">{u.displayName}</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span className="font-bold text-white">{String(u.to)}</span>
                    </span>
                  ))}

                {/* Array Updates */}
                {diff.arrayUpdates &&
                  diff.arrayUpdates.map((a, i) => (
                    <span
                      key={`arr-${i}`}
                      className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
                    >
                      <span className="font-semibold text-cyan-200">{a.displayName}</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span className="font-bold text-white">{String(a.to)}</span>
                    </span>
                  ))}
              </div>
            )}

            {/* 4. Ý nghĩa / Vì sao quan trọng? (Semantics) */}
            {explanationDetail.semantics && (
              <div
                className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20"
                data-testid="explanation-semantics"
              >
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                  <HelpCircle className="w-3 h-3" />
                  <span>Ý nghĩa:</span>
                </div>
                <span className="text-slate-300 leading-relaxed">
                  {explanationDetail.semantics}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div data-testid="educational-explanation" className="text-xs text-slate-300 leading-relaxed p-2 rounded-lg bg-slate-950/40 border border-slate-800">
            {explanation || 'Nhấn "Chạy chương trình" hoặc dùng các phím điều khiển thời gian để quan sát từng bước biến đổi của cấu trúc dữ liệu.'}
          </div>
        )}

        {/* Advanced Technical Notes */}
        {mode === 'advanced' && advancedNotes && (
          <div className="text-[11px] text-purple-300 flex items-center gap-1.5 pt-1 border-t border-purple-500/20">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{advancedNotes}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EducationalBanner;
