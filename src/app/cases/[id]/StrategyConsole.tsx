'use client';

import { useState, useTransition } from 'react';
import type { StrategicOption, IntelSnapshot, ActivationCondition } from '@/lib/ontology/intel-gaps';
import { TACTIC_TO_TICKETS } from '@/lib/ontology/tactic-tickets';
import { adoptStrategy } from '@/app/actions/strategy';
import { ActorBadge } from './ActorBadge';

const CATEGORY_LABEL: Record<StrategicOption['category'], string> = {
  offensive: '⚔️ 공격',
  defensive: '🛡 방어',
  settlement: '🤝 합의',
  preparation: '🎯 준비',
};

const CATEGORY_COLOR: Record<StrategicOption['category'], string> = {
  offensive: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  defensive: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  settlement: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  preparation: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
};

const RISK_LABEL: Record<StrategicOption['risk'], string> = {
  low: 'Risk 낮음',
  medium: 'Risk 중간',
  high: 'Risk 높음',
};

const RISK_COLOR: Record<StrategicOption['risk'], string> = {
  low: 'text-emerald-600',
  medium: 'text-amber-600',
  high: 'text-red-600',
};

export function StrategyConsole({
  strategy,
  caseId,
}: {
  strategy: IntelSnapshot['strategy'];
  caseId: string;
}) {
  const hasContent =
    strategy.available_tactics.length > 0 ||
    strategy.locked_tactics.length > 0;

  return (
    <section className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-t-md">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          ⚔️ 전략 콘솔
          <span className="text-xs font-normal opacity-70">
            승리 논리 — 선택형
          </span>
        </h3>
        <p className="text-xs opacity-80 mt-1">
          📊 {strategy.situation_summary}
        </p>
      </div>

      {!hasContent ? (
        <div className="p-6 text-sm text-zinc-500 text-center">
          정보가 더 쌓이면 전략이 여기 나타납니다.<br />
          (편파변제 분석, 시뮬, 채권자 등록 등)
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* 지금 검토할 만한 전술 */}
          {strategy.available_tactics.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                ✅ 지금 선택 가능 ({strategy.available_tactics.length})
              </div>
              <div className="space-y-2">
                {strategy.available_tactics.map((t) => (
                  <TacticCard key={t.key} tactic={t} caseId={caseId} />
                ))}
              </div>
            </div>
          )}

          {/* 의사결정 필요 */}
          {strategy.critical_decisions && strategy.critical_decisions.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md">
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                ⚠ 의사결정 필요
              </div>
              <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc list-inside space-y-0.5">
                {strategy.critical_decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 잠재 (정보 부족) */}
          {strategy.locked_tactics.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-2">
                🔒 인텔 부족으로 대기 ({strategy.locked_tactics.length})
              </div>
              <div className="space-y-1.5">
                {strategy.locked_tactics.map((t) => (
                  <LockedCard key={t.key} tactic={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TacticCard({
  tactic,
  caseId,
}: {
  tactic: StrategicOption;
  caseId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [adopted, setAdopted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tickets = TACTIC_TO_TICKETS[tactic.key] ?? [];

  const onAdopt = () => {
    setError(null);
    startTransition(async () => {
      const r = await adoptStrategy({ caseId, tacticKey: tactic.key });
      if (!r.ok) {
        setError(r.error ?? '채택 실패');
      } else {
        setAdopted(true);
      }
    });
  };

  return (
    <div className="p-3 border-2 border-zinc-200 dark:border-zinc-700 rounded-md hover:border-zinc-400 dark:hover:border-zinc-500 transition">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{tactic.icon}</span>
          <span className="font-semibold text-sm">{tactic.label}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLOR[tactic.category]}`}
          >
            {CATEGORY_LABEL[tactic.category]}
          </span>
          <ActorBadge actor={tactic.targetActor} />
        </div>
        <span className={`text-xs font-medium shrink-0 ${RISK_COLOR[tactic.risk]}`}>
          {RISK_LABEL[tactic.risk]}
        </span>
      </div>
      <p className="text-xs text-zinc-700 dark:text-zinc-300 mb-2">
        {tactic.reasoning}
      </p>
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span className="text-emerald-700 dark:text-emerald-400">
          ↑ {tactic.upside}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
          title="규칙기반 판정. LLM 환각 없음."
        >
          📐 규칙기반
        </span>
      </div>

      {tactic.activation_conditions.length > 0 && (
        <div className="mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1">활성화 조건</div>
          <ConditionList conds={tactic.activation_conditions} />
        </div>
      )}

      {tickets.length > 0 && (
        <details
          open={expanded}
          onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
          className="text-xs mb-2"
        >
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            채택 시 자동 생성될 칸반 티켓 {tickets.length}개 보기
          </summary>
          <ul className="mt-1.5 space-y-1 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700">
            {tickets.map((t, i) => (
              <li key={i} className="text-zinc-600 dark:text-zinc-400">
                ▸ {t.title}
                {t.due_in_days && (
                  <span className="text-zinc-400"> (D-{t.due_in_days})</span>
                )}
                {t.waiting_on && (
                  <span className="text-amber-600">
                    {' '}
                    · 대기:{' '}
                    {t.waiting_on === 'client'
                      ? '고객'
                      : t.waiting_on === 'court'
                        ? '법원'
                        : '상대'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {adopted ? (
        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded text-xs text-emerald-800 dark:text-emerald-300">
          ✅ 채택 완료. 칸반 Triage에 티켓 {tickets.length}개 생성됨.
        </div>
      ) : (
        <button
          onClick={onAdopt}
          disabled={pending}
          className="w-full px-3 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
        >
          {pending
            ? '채택 중...'
            : tickets.length > 0
              ? `이 전략 채택 → 티켓 ${tickets.length}개 자동 생성`
              : '이 전략 채택'}
        </button>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function LockedCard({ tactic }: { tactic: StrategicOption }) {
  return (
    <div className="p-2.5 border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-800/30">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="opacity-60">{tactic.icon}</span>
        <span className="font-medium text-zinc-600 dark:text-zinc-400">{tactic.label}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded opacity-70 ${CATEGORY_COLOR[tactic.category]}`}
        >
          {CATEGORY_LABEL[tactic.category]}
        </span>
        <ActorBadge actor={tactic.targetActor} />
      </div>
      {tactic.activation_conditions.length > 0 && (
        <div className="mt-1.5">
          <ConditionList conds={tactic.activation_conditions} />
        </div>
      )}
    </div>
  );
}

function ConditionList({ conds }: { conds: ActivationCondition[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {conds.map((c) => (
        <li
          key={c.key}
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            c.met
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 line-through'
          }`}
        >
          {c.met ? '✓' : '○'} {c.label}
        </li>
      ))}
    </ul>
  );
}
