import Link from 'next/link';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { NewCaseButton } from '@/components/NewCaseButton';
import { CASE_TYPE_LABEL, type CaseType, type Client } from '@/lib/types';

const TYPE_FILTERS: { key: CaseType | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'personal_rehab', label: '개인회생' },
  { key: 'divorce', label: '이혼' },
  { key: 'criminal', label: '형사' },
  { key: 'other', label: '기타' },
];

const STATUS_FILTERS: { key: 'active' | 'closed' | 'all'; label: string }[] = [
  { key: 'active', label: '진행중' },
  { key: 'closed', label: '종결' },
  { key: 'all', label: '전체' },
];

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type, status } = await searchParams;
  const typeFilter = (type as CaseType | 'all' | undefined) ?? 'all';
  const statusFilter = (status as 'active' | 'closed' | 'all' | undefined) ?? 'active';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let query = supabase
    .from('cases')
    .select(`
      id, title, case_type, status, case_number, court, opposing_party,
      retainer_date, closed_date, outcome, assigned_to,
      client:clients(id, name),
      assignee:users!cases_assigned_to_fkey(id, name, email)
    `)
    .order('created_at', { ascending: false });

  if (typeFilter !== 'all') query = query.eq('case_type', typeFilter);
  if (statusFilter === 'active') query = query.eq('status', 'active');
  else if (statusFilter === 'closed') query = query.neq('status', 'active');

  const { data: cases } = await query;

  const { data: clientsData } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  const allClients = (clientsData ?? []) as Client[];

  const casesData = (cases ?? []) as unknown as Array<{
    id: string;
    title: string;
    case_type: CaseType | null;
    status: string;
    case_number: string | null;
    court: string | null;
    opposing_party: string | null;
    retainer_date: string | null;
    closed_date: string | null;
    outcome: string | null;
    assigned_to: string | null;
    client: { id: string; name: string } | null;
    assignee: { id: string; name: string | null; email: string } | null;
  }>;
  const mkHref = (t: string, s: string) => {
    const params = new URLSearchParams();
    if (t !== 'all') params.set('type', t);
    if (s !== 'active') params.set('status', s);
    const q = params.toString();
    return q ? `/cases?${q}` : '/cases';
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="cases" />
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">사건</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{casesData.length}건</p>
          </div>
          <NewCaseButton clients={allClients} />
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterGroup
            label="유형"
            options={TYPE_FILTERS.map((f) => ({ ...f, href: mkHref(f.key, statusFilter) }))}
            active={typeFilter}
          />
          <FilterGroup
            label="상태"
            options={STATUS_FILTERS.map((f) => ({ ...f, href: mkHref(typeFilter, f.key) }))}
            active={statusFilter}
          />
        </div>

        {casesData.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-zinc-500">
              {typeFilter !== 'all' || statusFilter !== 'active'
                ? '조건에 맞는 사건이 없습니다'
                : '아직 사건이 없습니다'}
            </p>
            {typeFilter === 'all' && statusFilter === 'active' && (
              <NewCaseButton clients={allClients} variant="cta" label="+ 첫 사건 시작하기" />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {casesData.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className={`block p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md hover:shadow-sm ${c.status !== 'active' ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.title}</span>
                      <span className="text-xs text-zinc-500">·</span>
                      <span className="text-sm text-zinc-500">
                        {c.client?.name ?? '고객 미지정'}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          c.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {c.status === 'active' ? '진행중' : '종결'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                      {c.case_type && (
                        <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
                          {CASE_TYPE_LABEL[c.case_type]}
                        </span>
                      )}
                      {c.case_number && <span>#{c.case_number}</span>}
                      {c.court && <span>· {c.court}</span>}
                      {c.opposing_party && <span>· vs {c.opposing_party}</span>}
                      {c.retainer_date && (
                        <span>· 수임 {format(parseISO(c.retainer_date), 'yyyy.MM.dd')}</span>
                      )}
                      {c.closed_date && (
                        <span>· 종결 {format(parseISO(c.closed_date), 'yyyy.MM.dd')}</span>
                      )}
                    </div>
                    {c.outcome && (
                      <p className="mt-1 text-xs text-zinc-500">{c.outcome}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {c.assignee && (
                      <span className="text-xs text-zinc-500">
                        👤 {c.assignee.name ?? c.assignee.email.split('@')[0]}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  active,
}: {
  label: string;
  options: { key: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            className={`text-xs px-2.5 py-1 rounded ${
              o.key === active
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
