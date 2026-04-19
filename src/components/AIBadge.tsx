// AI 결과 신뢰도 · 검토필요 배지
// 사용: <AIBadge confidence={0.82} reasoning="원문에 명시됨" />
// 정책: 0.7 미만은 경고색, 미상은 중립색. 반드시 "검토 필수" 표기.

export function AIBadge({
  confidence,
  reasoning,
  source = 'LLM 추출',
  compact = false,
}: {
  confidence?: number | null;
  reasoning?: string | null;
  source?: string;
  compact?: boolean;
}) {
  const pct = typeof confidence === 'number' ? Math.round(confidence * 100) : null;
  const low = pct != null && pct < 70;

  const tone =
    pct == null
      ? 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
      : low
        ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
        : 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900';

  if (compact) {
    return (
      <span
        title={[
          source,
          pct != null ? `신뢰도 ${pct}%` : '신뢰도 미상',
          '변호사 검토 필수',
          reasoning ? `\n근거: ${reasoning}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${tone}`}
      >
        🤖 AI{pct != null && <span className="tabular-nums">{pct}%</span>}
        {low && <span>⚠</span>}
      </span>
    );
  }

  return (
    <div className={`text-xs px-2 py-1 rounded border ${tone} space-y-0.5`}>
      <div className="flex items-center gap-1.5">
        <span>🤖 {source}</span>
        {pct != null && <span className="tabular-nums font-semibold">신뢰도 {pct}%</span>}
        {low && <span className="text-amber-700 dark:text-amber-400">⚠ 낮음</span>}
        <span className="ml-auto text-[10px] italic opacity-70">변호사 검토 필수</span>
      </div>
      {reasoning && (
        <div className="text-[10px] opacity-80 italic">근거: {reasoning}</div>
      )}
    </div>
  );
}
