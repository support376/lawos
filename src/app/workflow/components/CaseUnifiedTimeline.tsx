import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';
import { PAYMENT_KIND_LABEL } from '@/lib/ontology/core/objects';
import { getActionSpec } from '@/lib/ontology/core/action-registry';

interface TimelineItem {
  id: string;
  at: string;
  kind: 'stage' | 'communication' | 'payment' | 'hold' | 'action' | 'interaction' | 'court' | 'consultation';
  icon: string;
  title: string;
  detail?: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'zinc';
}

function krw(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export async function CaseUnifiedTimeline({
  caseId,
  clientId,
  leadId,
}: {
  caseId: string;
  clientId: string | null;
  leadId: string | null;
}) {
  const supabase = await createClient();

  // 다양한 소스에서 이벤트 긁어오기
  const [stageHistRes, commsRes, schedulesRes, holdsRes, actionsRes, interactionsRes, courtOrdersRes, consultRes] = await Promise.all([
    supabase.from('rehab_stage_history').select('*').eq('case_id', caseId).order('entry_date'),
    supabase.from('communications')
      .select('*')
      .or(`and(subject_type.eq.case,subject_id.eq.${caseId})${leadId ? `,and(subject_type.eq.lead,subject_id.eq.${leadId})` : ''}${clientId ? `,and(subject_type.eq.client,subject_id.eq.${clientId})` : ''}`)
      .order('occurred_at', { ascending: false }),
    supabase.from('payment_schedules').select('*').eq('case_id', caseId),
    supabase.from('case_financial_holds').select('*').eq('case_id', caseId).order('held_at'),
    supabase.from('actions').select('*').eq('subject_type', 'case').eq('subject_id', caseId).order('created_at'),
    supabase.from('rehab_interactions').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('rehab_court_orders').select('*').eq('case_id', caseId).order('issued_date'),
    supabase.from('consultation_logs').select('*').eq('case_id', caseId),
  ]);

  const items: TimelineItem[] = [];

  // Stage 전이
  for (const h of (stageHistRes.data ?? []) as Array<{ id: string; stage_key: string; entry_date: string; exit_date: string | null }>) {
    const meta = STAGES[h.stage_key as StageKey];
    items.push({
      id: `stage-${h.id}`,
      at: h.entry_date,
      kind: 'stage',
      icon: '🔄',
      title: `Stage 진입: ${meta?.label ?? h.stage_key}`,
      detail: h.exit_date ? `종료 ${format(new Date(h.exit_date), 'MM-dd HH:mm')}` : undefined,
      tone: 'purple',
    });
  }

  // Communication
  for (const c of (commsRes.data ?? []) as Array<{ id: string; channel: string; direction: string; occurred_at: string; summary: string | null; content: string | null; subject_type: string }>) {
    const iconMap: Record<string, string> = {
      call: '📞', kakao: '💬', sms: '📱', email: '✉️', visit: '🚶', letter: '✉',
    };
    items.push({
      id: `comm-${c.id}`,
      at: c.occurred_at,
      kind: 'communication',
      icon: iconMap[c.channel] ?? '💬',
      title: `${c.channel.toUpperCase()} ${c.direction === 'inbound' ? '수신' : '발신'} · ${c.subject_type === 'lead' ? '(리드 시점)' : ''}`,
      detail: c.summary ?? (c.content?.slice(0, 80) ?? undefined),
      tone: 'blue',
    });
  }

  // Payment 입금·연체
  for (const s of (schedulesRes.data ?? []) as Array<{ id: string; paid_date: string | null; due_date: string; status: string; installment_no: number; kind: 'retainer' | 'installment' | 'success_fee' | 'court_fee' | 'misc'; amount_krw: number; paid_amount_krw: number; dunning_count: number; last_dunning_at: string | null }>) {
    if (s.paid_date) {
      items.push({
        id: `pay-${s.id}`,
        at: s.paid_date,
        kind: 'payment',
        icon: '💰',
        title: `${s.installment_no}회차 입금 (${PAYMENT_KIND_LABEL[s.kind]})`,
        detail: `${krw(s.paid_amount_krw)}원`,
        tone: 'emerald',
      });
    }
    if (s.last_dunning_at) {
      items.push({
        id: `dun-${s.id}`,
        at: s.last_dunning_at,
        kind: 'payment',
        icon: '📨',
        title: `${s.installment_no}회차 독촉 #${s.dunning_count}`,
        detail: `연체: ${krw(s.amount_krw - s.paid_amount_krw)}원`,
        tone: 'amber',
      });
    }
  }

  // Hold
  for (const h of (holdsRes.data ?? []) as Array<{ id: string; active: boolean; reason: string; held_at: string; released_at: string | null }>) {
    items.push({
      id: `hold-${h.id}-held`,
      at: h.held_at,
      kind: 'hold',
      icon: '🛑',
      title: 'Finance Hold 부과',
      detail: h.reason,
      tone: 'red',
    });
    if (h.released_at) {
      items.push({
        id: `hold-${h.id}-rel`,
        at: h.released_at,
        kind: 'hold',
        icon: '🔓',
        title: 'Finance Hold 해제',
        tone: 'emerald',
      });
    }
  }

  // Action 완료
  for (const a of (actionsRes.data ?? []) as Array<{ id: string; action_type: string; title: string; status: string; created_at: string; completed_at: string | null }>) {
    const spec = getActionSpec(a.action_type);
    if (a.status === 'done' && a.completed_at) {
      items.push({
        id: `act-done-${a.id}`,
        at: a.completed_at,
        kind: 'action',
        icon: '✅',
        title: `${a.title} (완료)`,
        detail: spec?.label,
        tone: 'emerald',
      });
    } else {
      items.push({
        id: `act-new-${a.id}`,
        at: a.created_at,
        kind: 'action',
        icon: '▶️',
        title: `Action 생성: ${a.title}`,
        detail: spec?.label,
        tone: 'zinc',
      });
    }
  }

  // 보정·즉시항고
  for (const i of (interactionsRes.data ?? []) as Array<{ id: string; type: string; iteration_number: number; status: string; created_at: string; items: string[] }>) {
    items.push({
      id: `intr-${i.id}`,
      at: i.created_at,
      kind: 'interaction',
      icon: '⚖️',
      title: `${i.type} #${i.iteration_number} (${i.status})`,
      detail: (i.items ?? []).slice(0, 2).join(', '),
      tone: 'amber',
    });
  }

  // 법원 명령
  for (const o of (courtOrdersRes.data ?? []) as Array<{ id: string; order_type: string; issued_date: string; deadline: string | null }>) {
    items.push({
      id: `court-${o.id}`,
      at: o.issued_date,
      kind: 'court',
      icon: '🏛',
      title: `법원 명령: ${o.order_type}`,
      detail: o.deadline ? `기한 ${o.deadline}` : undefined,
      tone: 'red',
    });
  }

  // 상담일지 확정
  for (const c of (consultRes.data ?? []) as Array<{ id: string; status: string; consultation_date: string; finalized_at: string | null; created_at: string }>) {
    if (c.finalized_at) {
      items.push({
        id: `cl-fin-${c.id}`,
        at: c.finalized_at,
        kind: 'consultation',
        icon: '📋',
        title: '상담일지 확정',
        tone: 'purple',
      });
    } else {
      items.push({
        id: `cl-init-${c.id}`,
        at: c.created_at,
        kind: 'consultation',
        icon: '📋',
        title: '상담일지 작성 시작',
        tone: 'purple',
      });
    }
  }

  // 시간순 정렬 (최신 위)
  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">📜 통합 타임라인 ({items.length})</h2>
        <span className="text-[10px] text-zinc-500">리드부터 지금까지 · 최신 순</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">이력 없음</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 50).map((it) => (
            <TimelineRow key={it.id} item={it} />
          ))}
          {items.length > 50 && (
            <div className="text-[10px] text-zinc-500 text-center pt-2">... 외 {items.length - 50}건</div>
          )}
        </div>
      )}
    </section>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const border = {
    blue: 'border-l-blue-400',
    emerald: 'border-l-emerald-400',
    amber: 'border-l-amber-400',
    red: 'border-l-red-400',
    purple: 'border-l-purple-400',
    zinc: 'border-l-zinc-300',
  }[item.tone ?? 'zinc'];
  return (
    <div className={`border-l-2 ${border} pl-3 py-1`}>
      <div className="flex items-baseline gap-2 text-xs">
        <span>{item.icon}</span>
        <span className="font-medium">{item.title}</span>
        <span className="text-[10px] text-zinc-500 ml-auto shrink-0">
          {format(new Date(item.at), 'yyyy-MM-dd HH:mm')}
        </span>
      </div>
      {item.detail && (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap">
          {item.detail}
        </p>
      )}
    </div>
  );
}
