import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { KanbanBoard } from './components/KanbanBoard';
import { Sidebar } from './components/Sidebar';
import { SampleDataButton } from './components/SampleDataButton';
import { NewCaseButton } from '@/components/NewCaseButton';
import type {
  Client,
  Case,
  KanbanColumn as ColumnType,
  TicketWithRelations,
  TeamMemberLite,
} from '@/lib/types';

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientFilter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: board } = await supabase
    .from('kanban_boards')
    .select('id, name, workspace_id')
    .limit(1)
    .maybeSingle();

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">워크스페이스를 찾을 수 없습니다</p>
          <p className="text-sm text-zinc-500">가입 트리거가 실행되지 않았을 수 있습니다.</p>
          <form action="/auth/signout" method="post" className="pt-4">
            <button className="text-sm underline text-zinc-500">로그아웃</button>
          </form>
        </div>
      </div>
    );
  }

  const [columnsRes, clientsRes, casesRes, ticketsRes, membersRes] = await Promise.all([
    supabase
      .from('kanban_columns')
      .select('id, board_id, key, name, order, color')
      .eq('board_id', board.id)
      .order('order', { ascending: true }),
    supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('tickets')
      .select(`
        id, workspace_id, board_id, column_key, "order",
        case_id, client_id, title, description, type, priority,
        due_date, waiting_on,
        source_event_id, ai_suggested, ai_reasoning, ai_confidence,
        action_type,
        assigned_to, created_by, created_at, updated_at, completed_at,
        client:clients(id, name),
        case:cases(id, title, case_type)
      `)
      .eq('board_id', board.id)
      .order('order', { ascending: true }),
    supabase
      .from('workspace_members')
      .select('user:users(id, name, email)')
      .eq('workspace_id', board.workspace_id),
  ]);

  const columns = (columnsRes.data ?? []) as ColumnType[];
  const clients = (clientsRes.data ?? []) as Client[];
  const cases = (casesRes.data ?? []) as Case[];
  let tickets = (ticketsRes.data ?? []) as unknown as TicketWithRelations[];
  const teamMembers = ((membersRes.data ?? []) as unknown as Array<{
    user: { id: string; name: string | null; email: string };
  }>).map((m) => m.user) as TeamMemberLite[];

  if (clientFilter) {
    tickets = tickets.filter((t) => t.client_id === clientFilter);
  }

  const isEmpty = clients.length === 0 && tickets.length === 0;

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="kanban" />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar clients={clients} activeClientId={clientFilter ?? null} />

        <main className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          {isEmpty ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-5 max-w-md">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">아직 할일이 없어요</h2>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    사건을 먼저 만들면 분야별 할일이 자동으로 세팅됩니다.<br />
                    또는 기존 데이터를 한 번에 불러오세요.
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-center pt-2">
                  <NewCaseButton clients={clients} variant="cta" label="+ 첫 사건 시작하기" />
                </div>
                <div className="pt-2">
                  <SampleDataButton />
                </div>
              </div>
            </div>
          ) : (
            <KanbanBoard
              columns={columns}
              tickets={tickets}
              clients={clients}
              cases={cases}
              teamMembers={teamMembers}
            />
          )}
        </main>
      </div>
    </div>
  );
}
