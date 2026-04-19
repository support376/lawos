import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { PaymentSchedule, PaymentStatus } from '@/lib/ontology/core/objects';
import { PAYMENT_STATUS_LABEL, PAYMENT_KIND_LABEL } from '@/lib/ontology/core/objects';
import type { DomainKey, MyRoleContext } from '@/lib/auth/my-roles';
import { PaymentCard } from '../components/PaymentCard';

const STATUS_COLUMNS: PaymentStatus[] = ['scheduled', 'partial', 'overdue', 'paid'];

interface PaymentWithCase extends PaymentSchedule {
  case: { id: string; title: string; case_type: string | null; client: { name: string } | null } | null;
}

export async function BillingPipeline({
  domain,
  ctx,
}: {
  domain: DomainKey;
  ctx: MyRoleContext;
}) {
  const supabase = await createClient();

  let q = supabase
    .from('payment_schedules')
    .select(`
      *,
      case:cases(id, title, case_type, client:clients(name))
    `)
    .eq('workspace_id', ctx.workspaceId)
    .order('due_date', { ascending: true })
    .limit(500);

  const { data } = await q;
  let schedules = ((data ?? []) as unknown as PaymentWithCase[]);

  if (domain !== '*') {
    schedules = schedules.filter((s) => s.case?.case_type === domain);
  }

  const grouped = new Map<PaymentStatus, PaymentWithCase[]>();
  STATUS_COLUMNS.forEach((s) => grouped.set(s, []));
  for (const s of schedules) {
    const col = s.status === 'waived' || s.status === 'refunded' ? 'paid' : s.status;
    grouped.get(col)?.push(s);
  }

  // KPI
  const totalOverdue = schedules
    .filter((s) => s.status === 'overdue')
    .reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);
  const thisMonthScheduled = schedules
    .filter((s) => {
      const now = new Date();
      const due = new Date(s.due_date);
      return (
        due.getFullYear() === now.getFullYear() &&
        due.getMonth() === now.getMonth() &&
        s.status !== 'paid'
      );
    })
    .reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);

  // 활성 Finance Hold
  const { data: holds } = await supabase
    .from('case_financial_holds')
    .select('case_id, reason, case:cases(id, title, client:clients(name))')
    .eq('workspace_id', ctx.workspaceId)
    .eq('active', true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-4 text-xs">
          <KPI label="미수금" value={krw(totalOverdue)} tone="danger" />
          <KPI label="이번달 예정" value={krw(thisMonthScheduled)} tone="info" />
          <KPI label="연체 건수" value={`${grouped.get('overdue')?.length ?? 0}건`} tone="warning" />
          <KPI label="활성 Hold" value={`${(holds ?? []).length}건`} tone={(holds ?? []).length > 0 ? 'warning' : 'info'} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUS_COLUMNS.map((status) => {
          const list = grouped.get(status) ?? [];
          const isOverdue = status === 'overdue';
          return (
            <div key={status} className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`text-xs font-semibold ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {isOverdue && '🔴 '}{PAYMENT_STATUS_LABEL[status]}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{list.length}</span>
              </div>
              <div className={`flex-1 space-y-2 rounded p-2 min-h-[200px] ${isOverdue ? 'bg-red-50 dark:bg-red-950/20' : 'bg-zinc-100 dark:bg-zinc-900'}`}>
                {list.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic text-center py-4">—</p>
                ) : (
                  list.map((s) => (
                    <PaymentCard
                      key={s.id}
                      schedule={s}
                      caseLabel={`${s.case?.client?.name ?? '?'} (${PAYMENT_KIND_LABEL[s.kind]})`}
                      caseId={s.case?.id ?? ''}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 활성 Finance Hold */}
      {(holds ?? []).length > 0 && (
        <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">🛑 활성 Finance Hold</h3>
          <div className="space-y-1 text-xs">
            {(holds as unknown as Array<{
              case_id: string;
              reason: string;
              case: { id: string; title: string; client: { name: string } | null } | null;
            }>).map((h) => (
              <div key={h.case_id} className="flex items-center gap-2">
                <Link
                  href={`/workflow?case=${h.case_id}`}
                  className="font-medium hover:underline"
                >
                  {h.case?.client?.name ?? '?'}
                </Link>
                <span>— {h.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'info' | 'danger' | 'warning';
}) {
  const color =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-zinc-700 dark:text-zinc-300';
  return (
    <div>
      <span className="text-zinc-500">{label}</span>{' '}
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
