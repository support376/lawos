import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortalUploader } from './PortalUploader';
import { DOCUMENTS } from '@/lib/ontology/documents';
import { getTemplate } from '@/lib/ontology/templates';

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  const { data: tok } = await admin
    .from('client_portal_tokens')
    .select(`
      id, case_id, client_id, expires_at, revoked_at,
      case:cases(id, title, case_type, workflow_docs),
      client:clients(id, name)
    `)
    .eq('token', token)
    .maybeSingle();

  if (!tok) notFound();

  const t = tok as unknown as {
    id: string;
    case_id: string;
    client_id: string;
    expires_at: string;
    revoked_at: string | null;
    case: {
      id: string;
      title: string;
      case_type: string | null;
      workflow_docs: Record<string, { status?: string }> | null;
    } | null;
    client: { id: string; name: string } | null;
  };

  const now = new Date();
  const expired = new Date(t.expires_at) < now;
  const revoked = !!t.revoked_at;

  if (revoked || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">링크가 만료되었습니다</h1>
          <p className="text-sm text-zinc-500">
            {revoked ? '링크가 취소되었습니다.' : '유효기간이 지났습니다.'} 변호사에게 새 링크를 요청해주세요.
          </p>
        </div>
      </div>
    );
  }

  // 필요한 서류 목록 (템플릿에서)
  const template = t.case?.case_type ? getTemplate(t.case.case_type) : null;
  const required = template?.document_keys ?? [];
  const docs = t.case?.workflow_docs ?? {};

  const neededDocs = required
    .map((k) => {
      const d = DOCUMENTS[k];
      const st = docs[k]?.status ?? 'missing';
      return d ? { ...d, status: st } : null;
    })
    .filter(Boolean) as Array<
    ReturnType<typeof getDoc> & { status: string }
  >;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">서류 업로드</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {t.client?.name}님, {t.case?.title} 관련 서류를 업로드해주세요.
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            유효기간: {new Date(t.expires_at).toLocaleDateString('ko-KR')} 까지
          </p>
        </header>

        {neededDocs.length > 0 && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">필요 서류</h2>
            <ul className="space-y-1.5 text-sm">
              {neededDocs.map((d) => (
                <li key={d.key} className="flex items-center gap-2">
                  <span>
                    {d.status === 'received'
                      ? '✅'
                      : d.status === 'requested'
                        ? '⏳'
                        : '◯'}
                  </span>
                  <span className={d.status === 'received' ? 'line-through text-zinc-400' : ''}>
                    {d.label}
                  </span>
                  <span className="text-xs text-zinc-500">· {d.source}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PortalUploader token={token} />

        <footer className="text-xs text-zinc-400 text-center pt-4">
          🔒 이 페이지는 암호화 전송됩니다. 파일은 변호사와 본인만 볼 수 있습니다.
        </footer>
      </div>
    </div>
  );
}

function getDoc(k: string) {
  return DOCUMENTS[k];
}
