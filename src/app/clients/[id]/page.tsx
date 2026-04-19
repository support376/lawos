import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { NewCaseButton } from '@/components/NewCaseButton';
import { CASE_TYPE_LABEL, type CaseType, type Client } from '@/lib/types';
import { ClientProfile } from '@/app/cases/[id]/ClientProfile';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 전체 컬럼 시도 → 실패 시 기본 컬럼만 (마이그레이션 미적용 폴백)
  let clientRow: Record<string, unknown> | null = null;
  const fullRes = await supabase
    .from('clients')
    .select(
      'id, name, phone, email, memo, created_at, occupation, monthly_income_krw, total_debt_krw, dependents_count, assets, risk_flags',
    )
    .eq('id', id)
    .maybeSingle();
  if (fullRes.error) {
    const minRes = await supabase
      .from('clients')
      .select('id, name, phone, email, memo, created_at')
      .eq('id', id)
      .maybeSingle();
    clientRow = minRes.data ?? null;
  } else {
    clientRow = fullRes.data ?? null;
  }

  if (!clientRow) notFound();
  const client = clientRow as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    memo: string | null;
    created_at: string;
    occupation?: string | null;
    monthly_income_krw?: number | null;
    total_debt_krw?: number | null;
    dependents_count?: number | null;
    assets?: Array<{ label: string; value_krw: number; kind?: string }> | null;
    risk_flags?: Record<string, boolean> | null;
  };

  const [{ data: cases }, { data: tickets }] = await Promise.all([
    supabase
      .from('cases')
      .select('id, title, case_type, status, case_number, court, retainer_date, closed_date, outcome')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, case_id, column_key')
      .eq('client_id', id)
      .neq('column_key', 'done'),
  ]);

  const casesData = cases ?? [];
  const ticketsData = tickets ?? [];

  const activeCases = casesData.filter((c) => c.status === 'active');
  const closedCases = casesData.filter((c) => c.status !== 'active');

  const ticketCount = (caseId: string) =>
    ticketsData.filter((t) => t.case_id === caseId).length;

  const clientSummary = {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    memo: client.memo,
    occupation: client.occupation ?? null,
    monthly_income_krw: client.monthly_income_krw ?? null,
    total_debt_krw: client.total_debt_krw ?? null,
    dependents_count: client.dependents_count ?? null,
    assets: client.assets ?? [],
    risk_flags: client.risk_flags ?? {},
    activeCaseCount: activeCases.length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="clients" />
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        <div>
          <Link
            href="/clients"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← 고객 목록
          </Link>
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            <div className="flex flex-col gap-2 shrink-0">
              <NewCaseButton
                clients={[client as Client]}
                defaultClientId={client.id}
                variant="primary"
                label="+ 새 사건"
              />
              <Link
                href={`/kanban?client=${client.id}`}
                className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-center"
              >
                칸반에서 보기
              </Link>
            </div>
          </div>
        </div>

        <ClientProfile client={clientSummary} />

        <section>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            활성 사건 ({activeCases.length})
          </h2>
          {activeCases.length === 0 ? (
            <div className="text-sm text-zinc-500 py-4">
              진행 중인 사건 없음.{' '}
              <span className="text-xs">오른쪽 "+ 새 사건" 버튼으로 추가하세요.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {activeCases.map((c) => (
                <CaseRow key={c.id} caseRow={c} ticketCount={ticketCount(c.id)} />
              ))}
            </div>
          )}
        </section>

        {closedCases.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-500 mb-2">
              종결 사건 ({closedCases.length})
            </h2>
            <div className="space-y-2 opacity-70">
              {closedCases.map((c) => (
                <CaseRow key={c.id} caseRow={c} ticketCount={ticketCount(c.id)} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CaseRow({
  caseRow,
  ticketCount,
}: {
  caseRow: {
    id: string;
    title: string;
    case_type: string | null;
    status: string;
    case_number: string | null;
    court: string | null;
    retainer_date: string | null;
    closed_date: string | null;
    outcome: string | null;
  };
  ticketCount: number;
}) {
  return (
    <Link
      href={`/cases/${caseRow.id}`}
      className="block p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{caseRow.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-500">
            {caseRow.case_type && (
              <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
                {CASE_TYPE_LABEL[caseRow.case_type as CaseType]}
              </span>
            )}
            {caseRow.case_number && <span>#{caseRow.case_number}</span>}
            {caseRow.court && <span>· {caseRow.court}</span>}
            {caseRow.retainer_date && (
              <span>· 수임 {format(parseISO(caseRow.retainer_date), 'yyyy.MM.dd')}</span>
            )}
            {caseRow.closed_date && (
              <span>· 종결 {format(parseISO(caseRow.closed_date), 'yyyy.MM.dd')}</span>
            )}
          </div>
          {caseRow.outcome && (
            <p className="mt-1 text-xs text-zinc-500">{caseRow.outcome}</p>
          )}
        </div>
        {ticketCount > 0 && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400">
            할일 {ticketCount}
          </span>
        )}
      </div>
    </Link>
  );
}
