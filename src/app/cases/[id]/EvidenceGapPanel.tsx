'use client';

import type { EvidenceGap } from '@/lib/ontology/engine/evidence-gap';

export function EvidenceGapPanel({ gaps }: { gaps: EvidenceGap[] }) {
  if (gaps.length === 0) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          📦 증거 갭 분석
          <span className="text-xs text-zinc-500 font-normal">
            활성 전략이 요구하는 증거 중 미확보
          </span>
        </h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
          title="규칙기반 판정. LLM 환각 없음."
        >
          📐 규칙기반
        </span>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {gaps.map((g) => (
          <div key={g.strategyKey} className="p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-medium">{g.strategyLabel}</div>
              <div className="text-xs tabular-nums text-zinc-500">
                커버리지 {g.coveragePct}%
              </div>
            </div>

            {g.satisfiedEvidence.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] text-zinc-500 mb-1">✓ 확보됨</div>
                <div className="flex flex-wrap gap-1">
                  {g.satisfiedEvidence.map((ev, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-zinc-500 mb-1">
                ⚠ 미확보 ({g.missingEvidence.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {g.missingEvidence.map((ev, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500">
        💡 미확보 항목은 전략 채택 시 칸반 티켓으로 자동 요청됩니다. (추후 "갭 기반 티켓 일괄 생성" 버튼 연결 예정)
      </div>
    </section>
  );
}
