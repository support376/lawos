import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { NewClientButton } from '@/components/NewClientButton';
import { CASE_TYPE_LABEL, type CaseType } from '@/lib/types';

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: clients }, { data: cases }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, phone, email, memo, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id, client_id, case_type, status'),
  ]);

  const clientsData = clients ?? [];
  const casesData = cases ?? [];

  const stats = clientsData.map((c) => {
    const myCases = casesData.filter((cs) => cs.client_id === c.id);
    const activeCases = myCases.filter((cs) => cs.status === 'active').length;
    const closedCases = myCases.filter((cs) => cs.status !== 'active').length;
    const types = Array.from(
      new Set(myCases.map((cs) => cs.case_type).filter(Boolean)),
    ) as CaseType[];
    return { client: c, activeCases, closedCases, types };
  });

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="clients" />
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">고객</h1>
            <p className="text-sm text-zinc-500 mt-0.5">총 {clientsData.length}명</p>
          </div>
          <NewClientButton />
        </div>

        {clientsData.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-sm text-zinc-500">아직 고객이 없습니다.</p>
            <div className="flex gap-2 justify-center">
              <NewClientButton variant="cta" label="+ 첫 고객 추가" />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">이름</th>
                  <th className="text-left px-4 py-2.5 font-medium">연락처</th>
                  <th className="text-left px-4 py-2.5 font-medium">사건 유형</th>
                  <th className="text-right px-4 py-2.5 font-medium">활성 사건</th>
                  <th className="text-right px-4 py-2.5 font-medium">종결</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {stats.map(({ client, activeCases, closedCases, types }) => (
                  <tr key={client.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium hover:underline"
                      >
                        {client.name}
                      </Link>
                      {client.memo && (
                        <p className="text-xs text-zinc-500 truncate max-w-xs">
                          {client.memo}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {client.phone || ''}
                      {client.phone && client.email && <br />}
                      {client.email || ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {types.map((t) => (
                          <span
                            key={t}
                            className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded"
                          >
                            {CASE_TYPE_LABEL[t]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{activeCases}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {closedCases}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
