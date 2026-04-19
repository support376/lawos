import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { listTeamMembers, listPendingInvites } from '@/app/actions/team';
import { InviteForm } from './InviteForm';
import { MemberRow } from './MemberRow';
import { InviteRow } from './InviteRow';

const ROLE_LABEL: Record<string, string> = {
  owner: '소유자',
  admin: '관리자',
  member: '멤버',
};

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) redirect('/kanban');

  const [members, invites] = await Promise.all([
    listTeamMembers(),
    listPendingInvites(),
  ]);

  const myRole = membership.role as 'owner' | 'admin' | 'member';
  const canInvite = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="team" />
      <main className="flex-1 max-w-3xl w-full mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">팀 설정</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            워크스페이스 멤버 · 초대 · 역할 관리
          </p>
        </div>

        {canInvite && (
          <section className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold mb-3">멤버 초대</h2>
            <InviteForm />
            <p className="text-xs text-zinc-500 mt-2">
              초대 이메일이 자동으로 발송됩니다. 수신자가 이메일 내 링크를 통해 가입하면 자동으로 이 워크스페이스에 합류합니다.
            </p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-3">
            멤버 <span className="text-zinc-500 font-normal">({members.length})</span>
          </h2>
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.map((m) => (
              <MemberRow
                key={m.user.id}
                member={m}
                myRole={myRole}
                currentUserId={user.id}
                roleLabel={ROLE_LABEL[m.role]}
              />
            ))}
          </div>
        </section>

        {invites.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">
              초대 대기 <span className="text-zinc-500 font-normal">({invites.length})</span>
            </h2>
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
              {invites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  invite={{
                    ...inv,
                    invited_at: format(parseISO(inv.invited_at), 'yyyy-MM-dd HH:mm'),
                  }}
                  canManage={canInvite}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
