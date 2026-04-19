import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { NewCaseButton } from '@/components/NewCaseButton';
import { CASE_TYPE_LABEL, type CaseType, type Client } from '@/lib/types';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone, email, memo, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!client) notFound();

  const { data: cases } = await supabase
    .from('cases')
    .select('id, title, case_type, status, case_number, court, retainer_date, closed_date, outcome')
    .eq('client_id', id)
    .order('created_at', { ascending: false });

  const casesData = cases ?? [];
  const activeCases = casesData.filter((c) => c.status === 'active');
  const closedCases = casesData.filter((c) => c.status !== 'active');

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
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold">{client.name}</h1>
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 space-y-0.5">
                {client.phone && <div>📞 {client.phone}</div>}
                {client.email && <div>✉️ {client.email}</div>}
                {client.memo && (
                  <div className="mt-2 text-xs text-zinc-500 whitespace-pre-wrap">
                    {client.memo}
                  </div>
                )}
              </div>
            </div>
            <NewCaseButton
              clients={[client as Client]}
              defaultClientId={client.id}
              variant="primary"
              label="+ 새 사건"
            />
          </div>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            활성 사건 ({activeCases.length})
          </h2>
          {activeCases.length === 0 ? (
            <div className="text-sm text-zinc-500 py-4">
              진행 중인 사건 없음.
            </div>
          ) : (
            <div className="space-y-2">
              {activeCases.map((c) => (
                <CaseRow key={c.id} caseRow={c} />
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
                <CaseRow key={c.id} caseRow={c} />
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
        </div>
      </div>
    </Link>
  );
}
