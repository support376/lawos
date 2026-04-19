import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { CASE_TYPE_LABEL, type CaseType, type CaseVisibility } from '@/lib/types';
import { CaseActions } from './CaseActions';
import { AssigneeSelect } from '@/components/AssigneeSelect';
import { VisibilitySelect } from './VisibilitySelect';
import { AttachmentList } from '@/components/AttachmentList';
import { CaseNotes } from './CaseNotes';

// 온톨로지·워크플로우 전체를 리셋 중.
// 이 페이지는 "사건 메타 + 첨부 + 노트 + 타임라인" 만 담당하는 최소 뼈대.
// 도메인별 워크플로우는 별도 /workflow 페이지에서 재구성 예정.

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: caseRow } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, status, case_number, court, opposing_party,
      retainer_date, closed_date, outcome, assigned_to, visibility, created_at,
      free_notes,
      client:clients(id, name, phone, email, memo),
      assignee:users!cases_assigned_to_fkey(id, name, email)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!caseRow) notFound();

  const raw = caseRow as Record<string, unknown>;
  const c = {
    id: raw.id as string,
    title: raw.title as string,
    case_type: (raw.case_type ?? null) as CaseType | null,
    status: (raw.status as string) ?? 'active',
    case_number: (raw.case_number ?? null) as string | null,
    court: (raw.court ?? null) as string | null,
    opposing_party: (raw.opposing_party ?? null) as string | null,
    retainer_date: (raw.retainer_date ?? null) as string | null,
    closed_date: (raw.closed_date ?? null) as string | null,
    outcome: (raw.outcome ?? null) as string | null,
    assigned_to: (raw.assigned_to ?? null) as string | null,
    visibility: (raw.visibility ?? 'workspace') as CaseVisibility,
    free_notes: (raw.free_notes ?? null) as string | null,
    created_at: raw.created_at as string,
    client: (raw.client ?? null) as {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      memo: string | null;
    } | null,
    assignee: (raw.assignee ?? null) as { id: string; name: string | null; email: string } | null,
  };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: membersRaw } = membership
    ? await supabase
        .from('workspace_members')
        .select('user:users(id, name, email)')
        .eq('workspace_id', membership.workspace_id)
    : { data: [] };
  const teamMembers = ((membersRaw ?? []) as unknown as Array<{
    user: { id: string; name: string | null; email: string };
  }>).map((m) => m.user);

  const [{ data: events }, { data: attachments }] = await Promise.all([
    supabase
      .from('events')
      .select('id, source_type, raw_content, occurred_at, created_at')
      .eq('case_id', id)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('attachments')
      .select('id, storage_path, original_name, mime_type, size_bytes, created_at')
      .eq('case_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const timelineItems = (events ?? []).map((ev) => ({
    id: ev.id,
    date: ev.occurred_at ?? ev.created_at,
    kind: ev.source_type === 'milestone' ? ('milestone' as const) : ('event' as const),
    title: (ev.raw_content ?? '').slice(0, 120),
    detail: ev.raw_content,
    source_type: ev.source_type,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="cases" />
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        <div>
          <Link
            href="/cases"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← 사건 목록
          </Link>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold">{c.title}</h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    c.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {c.status === 'active' ? '진행중' : '종결'}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {c.client && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">고객</span>
                    <Link href={`/clients/${c.client.id}`} className="hover:underline">
                      {c.client.name}
                    </Link>
                  </div>
                )}
                {c.case_type && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">유형</span>
                    <span>{CASE_TYPE_LABEL[c.case_type]}</span>
                  </div>
                )}
                {c.case_number && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">사건번호</span>
                    <span>{c.case_number}</span>
                  </div>
                )}
                {c.court && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">법원</span>
                    <span>{c.court}</span>
                  </div>
                )}
                {c.opposing_party && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">상대방</span>
                    <span>{c.opposing_party}</span>
                  </div>
                )}
                {c.retainer_date && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">수임일</span>
                    <span>{format(parseISO(c.retainer_date), 'yyyy-MM-dd')}</span>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-500 w-20 shrink-0">담당</span>
                  <AssigneeSelect
                    value={c.assigned_to}
                    kind="case"
                    entityId={c.id}
                    members={teamMembers}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-500 w-20 shrink-0">🔒 접근</span>
                  <VisibilitySelect caseId={c.id} value={c.visibility} />
                </div>
                {c.closed_date && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">종결일</span>
                    <span>{format(parseISO(c.closed_date), 'yyyy-MM-dd')}</span>
                  </div>
                )}
                {c.outcome && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">결과</span>
                    <span>{c.outcome}</span>
                  </div>
                )}
              </div>
            </div>
            <CaseActions caseId={c.id} status={c.status} />
          </div>
        </div>

        <CaseNotes caseId={c.id} initial={c.free_notes} />

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <AttachmentList target={{ caseId: c.id }} attachments={attachments ?? []} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">타임라인</h2>
          {timelineItems.length === 0 ? (
            <p className="text-xs text-zinc-500">이력 없음</p>
          ) : (
            <div className="border-l-2 border-zinc-200 dark:border-zinc-800 ml-2 space-y-3 py-2">
              {timelineItems.map((item) => (
                <div key={item.id} className="relative pl-5">
                  <div
                    className={`absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full ${
                      item.kind === 'milestone' ? 'bg-purple-500' : 'bg-blue-500'
                    }`}
                  />
                  <div className="text-xs text-zinc-500">
                    {format(parseISO(item.date), 'yyyy-MM-dd HH:mm')}
                    {item.source_type && ` · ${item.source_type}`}
                  </div>
                  <div className="text-sm mt-0.5 whitespace-pre-wrap">{item.title}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
