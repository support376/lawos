import type { StageKey, StageHistoryEntry } from '@/lib/ontology/domains/personal_rehab/entities';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';

// 정상 경로 stage 순서 (기각 우회·분기 제외)
const MAIN_FLOW: StageKey[] = [
  'consultation',
  'engagement',
  'document_prep',
  'filing',
  'correction_loop',
  'opening_decision',
  'claim_filing',
  'creditor_meeting',
  'plan_approval',
  'repayment',
  'discharge',
];

const BYPASS_FLOW: StageKey[] = ['dismissal', 'immediate_appeal', 'dismissal_revoked'];

export function StageTimeline({
  currentStage,
  stageHistory,
}: {
  currentStage: StageKey;
  stageHistory: StageHistoryEntry[];
}) {
  const visited = new Set(stageHistory.map((h) => h.stage_key));
  const currentIdx = MAIN_FLOW.indexOf(currentStage);
  const onBypass = BYPASS_FLOW.includes(currentStage);

  return (
    <div className="space-y-3">
      {/* 메인 플로우 */}
      <div className="flex items-center overflow-x-auto pb-2">
        {MAIN_FLOW.map((sk, i) => {
          const meta = STAGES[sk];
          const isCurrent = sk === currentStage;
          const isPast = visited.has(sk) || (currentIdx > i && !onBypass);
          const isFuture = !isCurrent && !isPast;
          const bg = isCurrent
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100'
            : isPast
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500';
          return (
            <div key={sk} className="flex items-center shrink-0">
              <div className={`px-2.5 py-1 rounded text-[11px] whitespace-nowrap ${bg}`}>
                {meta.label}
              </div>
              {i < MAIN_FLOW.length - 1 && (
                <div
                  className={`w-4 h-px ${
                    isPast && !isFuture ? 'bg-emerald-400' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 우회 경로 */}
      {onBypass && (
        <div>
          <div className="text-[10px] text-red-600 dark:text-red-400 mb-1">⚠ 기각 우회 경로</div>
          <div className="flex items-center gap-1">
            {BYPASS_FLOW.map((sk, i) => {
              const meta = STAGES[sk];
              const isCurrent = sk === currentStage;
              const isPast = visited.has(sk);
              const bg = isCurrent
                ? 'bg-red-600 text-white'
                : isPast
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800';
              return (
                <div key={sk} className="flex items-center">
                  <div className={`px-2 py-0.5 rounded text-[11px] ${bg}`}>{meta.label}</div>
                  {i < BYPASS_FLOW.length - 1 && <span className="mx-1 text-zinc-400">→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 현재 스테이지 상세 */}
      {(() => {
        const meta = STAGES[currentStage];
        return (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs">
            <div className="font-medium">{meta.label}</div>
            <p className="text-zinc-500 mt-0.5">{meta.description}</p>
            <div className="mt-1.5 flex gap-3 text-[10px] text-zinc-400">
              <span>담당: {meta.primary_actor}</span>
              {meta.typical_duration_days && <span>예상 {meta.typical_duration_days}일</span>}
              {meta.has_precedent_lookup && <span>📚 판례</span>}
              {meta.has_communication && <span>💬 소통</span>}
            </div>
          </div>
        );
      })()}

      {/* 최근 히스토리 */}
      {stageHistory.length > 0 && (
        <details className="text-xs">
          <summary className="text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100">
            전이 이력 ({stageHistory.length})
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l border-zinc-200 dark:border-zinc-800">
            {stageHistory.map((h) => (
              <div key={h.id} className="flex items-baseline gap-2">
                <span className="text-zinc-400 tabular-nums">
                  {new Date(h.entry_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </span>
                <span>{STAGES[h.stage_key]?.label ?? h.stage_key}</span>
                {h.exit_date && (
                  <span className="text-zinc-400">
                    ~ {new Date(h.exit_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
