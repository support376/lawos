// 전략 카드에 targetActor 배지.

const ACTOR_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  client: { label: '의뢰인', icon: '👤', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' },
  court: { label: '법원', icon: '⚖️', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
  family_court: { label: '가정법원', icon: '⚖️', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
  creditor: { label: '채권자', icon: '💳', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800' },
  spouse: { label: '배우자', icon: '💔', color: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' },
  affair_partner: { label: '상간자', icon: '🩹', color: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' },
  victim: { label: '피해자', icon: '🙏', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  prosecutor: { label: '검사', icon: '⚖️', color: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' },
};

export function ActorBadge({ actor }: { actor?: string | null }) {
  if (!actor) return null;
  const meta = ACTOR_LABELS[actor] ?? {
    label: actor,
    icon: '🎯',
    color: 'bg-zinc-100 text-zinc-500',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${meta.color}`}
      title={`이 전략은 ${meta.label}을(를) 겨냥함`}
    >
      🎯 {meta.icon} {meta.label}
    </span>
  );
}
