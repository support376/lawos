import { createClient } from '@/lib/supabase/server';
import type { ActionRecord } from '@/lib/ontology/core/objects';
import { ROLE_LABEL, type Role } from '@/lib/ontology/core/roles';
import { getActionSpec } from '@/lib/ontology/core/action-registry';
import { CreateActionButton } from './CreateActionButton';
import { ActionItemCard } from './ActionItemCard';

const TEAM_GROUPS: Array<{
  label: string;
  icon: string;
  roles: Role[];
}> = [
  { label: '상담팀', icon: '📞', roles: ['consultant'] },
  { label: '작성팀', icon: '✍️', roles: ['attorney', 'document_staff', 'analysis_staff', 'correction_staff'] },
  { label: '재무팀', icon: '💰', roles: ['billing_staff'] },
  { label: '행정팀', icon: '🗂', roles: ['admin'] },
];

export async function CaseActionBoard({
  caseId,
  workspaceId,
}: {
  caseId: string;
  workspaceId: string;
}) {
  const supabase = await createClient();
  const [actionsRes, membersRes] = await Promise.all([
    supabase
      .from('actions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('subject_type', 'case')
      .eq('subject_id', caseId)
      .in('status', ['pending', 'doing', 'blocked', 'done'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('workspace_members')
      .select('user:users(id, name, email)')
      .eq('workspace_id', workspaceId),
  ]);

  const actions = ((actionsRes.data ?? []) as ActionRecord[]);
  const members = ((membersRes.data ?? []) as unknown as Array<{ user: { id: string; name: string | null; email: string } }>).map((r) => r.user);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const active = actions.filter((a) => a.status !== 'done');
  const done = actions.filter((a) => a.status === 'done').slice(0, 5);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">🎯 진행 중 Action (팀별)</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            활성 {active.length} · 완료 {done.length}
          </span>
          <CreateActionButton subjectType="case" subjectId={caseId} members={members} />
        </div>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">진행 중인 Action 없음. "+ Action 생성"으로 추가.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TEAM_GROUPS.map((g) => {
            const list = active.filter((a) => a.team_role && g.roles.includes(a.team_role));
            return (
              <div key={g.label} className="min-h-[120px] bg-zinc-50 dark:bg-zinc-800/30 rounded p-2">
                <div className="text-[11px] font-semibold mb-1">
                  {g.icon} {g.label} ({list.length})
                </div>
                {list.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic">—</p>
                ) : (
                  <div className="space-y-1.5">
                    {list.map((a) => (
                      <ActionItemCard
                        key={a.id}
                        action={a}
                        assigneeName={
                          a.assigned_to
                            ? memberMap.get(a.assigned_to)?.name ??
                              memberMap.get(a.assigned_to)?.email.split('@')[0] ??
                              null
                            : null
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            최근 완료 ({done.length})
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l border-zinc-200 dark:border-zinc-800">
            {done.map((a) => {
              const spec = getActionSpec(a.action_type);
              return (
                <div key={a.id} className="flex items-baseline gap-2">
                  <span className="text-zinc-400 tabular-nums">
                    {a.completed_at ? new Date(a.completed_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '—'}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400 line-through">{a.title}</span>
                  {spec && <span className="text-[10px] text-zinc-500">· {spec.label}</span>}
                  {a.team_role && <span className="text-[10px] text-zinc-500">· {ROLE_LABEL[a.team_role]}</span>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
