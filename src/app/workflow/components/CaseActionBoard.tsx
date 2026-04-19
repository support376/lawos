import { createClient } from '@/lib/supabase/server';
import type { ActionRecord } from '@/lib/ontology/core/objects';
import { ACTION_STATUS_LABEL } from '@/lib/ontology/core/objects';
import { ROLE_LABEL, type Role } from '@/lib/ontology/core/roles';
import { getActionSpec } from '@/lib/ontology/core/action-registry';

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
  const { data } = await supabase
    .from('actions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('subject_type', 'case')
    .eq('subject_id', caseId)
    .in('status', ['pending', 'doing', 'blocked', 'done'])
    .order('created_at', { ascending: false })
    .limit(100);

  const actions = ((data ?? []) as ActionRecord[]);
  const active = actions.filter((a) => a.status !== 'done');
  const done = actions.filter((a) => a.status === 'done').slice(0, 5);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">🎯 진행 중 (팀별)</h2>
        <span className="text-xs text-zinc-500">
          활성 {active.length} · 완료 {done.length}
        </span>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">진행 중인 Action 없음</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TEAM_GROUPS.map((g) => {
            const list = active.filter((a) => a.team_role && g.roles.includes(a.team_role));
            return (
              <div key={g.label} className="min-h-[120px] bg-zinc-50 dark:bg-zinc-800/30 rounded p-2">
                <div className="text-[11px] font-semibold mb-1">{g.icon} {g.label}</div>
                {list.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic">—</p>
                ) : (
                  <div className="space-y-1.5">
                    {list.map((a) => {
                      const spec = getActionSpec(a.action_type);
                      return (
                        <div key={a.id} className="bg-white dark:bg-zinc-900 rounded p-1.5 text-[11px]">
                          <div className="font-medium truncate">{a.title}</div>
                          <div className="text-[10px] text-zinc-500 flex gap-1.5 mt-0.5">
                            <StatusBadge status={a.status} />
                            {spec && <span>{spec.label}</span>}
                            {a.due_date && <span>· {a.due_date}</span>}
                          </div>
                        </div>
                      );
                    })}
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
            {done.map((a) => (
              <div key={a.id} className="flex items-baseline gap-2">
                <span className="text-zinc-400 tabular-nums">
                  {a.completed_at ? new Date(a.completed_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '—'}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400 line-through">{a.title}</span>
                {a.team_role && <span className="text-[10px] text-zinc-500">· {ROLE_LABEL[a.team_role]}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-[10px] text-zinc-500 italic">
        💡 Action 생성·할당 UI는 다음 라운드. 현재는 `actions` 테이블에 직접 insert된 기록만 표시.
      </p>
    </section>
  );
}

function StatusBadge({ status }: { status: ActionRecord['status'] }) {
  const color =
    status === 'doing'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
      : status === 'blocked'
        ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
        : status === 'pending'
          ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] ${color}`}>
      {ACTION_STATUS_LABEL[status]}
    </span>
  );
}
