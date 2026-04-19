import type { StageKey, StageHistoryEntry } from '@/lib/ontology/domains/personal_rehab/entities';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';

// 정상경로 15단계 (기각·즉시항고·기각취소는 아래 별도)
const MAIN_FLOW: StageKey[] = [
  'consultation', 'engagement', 'document_prep', 'filing',
  'correction_loop', 'opening_decision', 'claim_filing',
  'creditor_meeting', 'plan_approval', 'repayment', 'discharge',
];
const BYPASS: StageKey[] = ['dismissal', 'immediate_appeal', 'dismissal_revoked'];

const PHASE_COLOR: Record<string, string> = {
  pre_filing: '#DBEAFE',      // blue-100
  filing_review: '#FEF3C7',   // amber-100
  post_opening: '#DCFCE7',    // emerald-100
  repayment: '#F3E8FF',       // purple-100
  closing: '#E4E4E7',         // zinc-200
};

export function StageMap({
  currentStage,
  history,
}: {
  currentStage: StageKey;
  history: StageHistoryEntry[];
}) {
  const visited = new Set(history.map((h) => h.stage_key));
  const onBypass = BYPASS.includes(currentStage);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">📍 사건 지도</h2>
        <div className="flex gap-2 text-[10px] text-zinc-500">
          <Legend color="#DBEAFE" label="수임전" />
          <Legend color="#FEF3C7" label="심사" />
          <Legend color="#DCFCE7" label="개시후" />
          <Legend color="#F3E8FF" label="변제" />
          <Legend color="#E4E4E7" label="종결" />
        </div>
      </div>

      {/* Main Flow SVG */}
      <div className="overflow-x-auto pb-2">
        <svg
          viewBox={`0 0 ${MAIN_FLOW.length * 110 + 20} 120`}
          className="w-full min-w-[1200px]"
          style={{ minHeight: 120 }}
        >
          {MAIN_FLOW.map((key, i) => {
            const meta = STAGES[key];
            const isCurrent = key === currentStage;
            const isPast = visited.has(key);
            const x = 20 + i * 110;
            const y = 40;
            const color = PHASE_COLOR[meta.phase];
            const stroke = isCurrent ? '#18181B' : isPast ? '#059669' : '#D4D4D8';
            const strokeWidth = isCurrent ? 3 : isPast ? 2 : 1;
            const textColor = isCurrent ? '#18181B' : isPast ? '#065F46' : '#71717A';
            return (
              <g key={key}>
                {i < MAIN_FLOW.length - 1 && (
                  <line
                    x1={x + 95}
                    y1={y + 20}
                    x2={x + 110 + 5}
                    y2={y + 20}
                    stroke={isPast ? '#059669' : '#D4D4D8'}
                    strokeWidth={2}
                  />
                )}
                <rect
                  x={x}
                  y={y}
                  width={95}
                  height={40}
                  rx={8}
                  fill={color}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
                <text
                  x={x + 47.5}
                  y={y + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={isCurrent ? 700 : 500}
                  fill={textColor}
                >
                  {meta.label}
                </text>
                <text
                  x={x + 47.5}
                  y={y + 33}
                  textAnchor="middle"
                  fontSize={9}
                  fill={textColor}
                  opacity={0.7}
                >
                  {meta.typical_duration_days ? `~${meta.typical_duration_days}일` : '—'}
                </text>
                {isCurrent && (
                  <circle cx={x + 47.5} cy={y - 6} r={4} fill="#EF4444">
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* 폐지 분기 (수직 아래로) */}
          <g>
            <line x1={20 + 9 * 110 + 47.5} y1={80} x2={20 + 9 * 110 + 47.5} y2={105} stroke="#A1A1AA" strokeDasharray="3 3" />
            <text x={20 + 9 * 110 + 47.5} y={118} textAnchor="middle" fontSize={10} fill="#A1A1AA">
              ↓ 폐지
            </text>
          </g>
        </svg>
      </div>

      {/* Bypass (기각 경로) */}
      {onBypass && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded">
          <div className="text-[10px] text-red-600 dark:text-red-400 mb-1">⚠ 기각 우회 경로 진행 중</div>
          <div className="flex items-center gap-1">
            {BYPASS.map((key, i) => {
              const meta = STAGES[key];
              const isCurrent = key === currentStage;
              const isPast = visited.has(key);
              return (
                <div key={key} className="flex items-center">
                  <div
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      isCurrent
                        ? 'bg-red-600 text-white'
                        : isPast
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
                    }`}
                  >
                    {meta.label}
                  </div>
                  {i < BYPASS.length - 1 && <span className="mx-1 text-zinc-400">→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 현재 Stage 상세 */}
      {(() => {
        const meta = STAGES[currentStage];
        return (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs">
            <div className="font-medium">📌 {meta.label}</div>
            <p className="text-zinc-500 mt-0.5">{meta.description}</p>
            <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
              <span>주 담당: {meta.primary_actor}</span>
              {meta.typical_duration_days && <span>예상 {meta.typical_duration_days}일</span>}
              {meta.has_precedent_lookup && <span>📚 판례 조회</span>}
              {meta.has_communication && <span>💬 소통 발생</span>}
            </div>
          </div>
        );
      })()}
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ backgroundColor: color, border: '1px solid #D4D4D8' }} />
      {label}
    </span>
  );
}
