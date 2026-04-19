-- LawOS V1 Row-Level Security
-- Spec: lawos_kanban_spec.md §4.3

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_activities ENABLE ROW LEVEL SECURITY;

-- workspace 멤버십 헬퍼 (RLS 내부 재귀 방지 위해 SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;

-- users: 본인만 읽기/수정
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- workspace_members: 본인 멤버십만 조회
CREATE POLICY "members_self_select" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- workspaces: 소속된 워크스페이스만
CREATE POLICY "workspaces_member_select" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));
CREATE POLICY "workspaces_owner_update" ON public.workspaces
  FOR UPDATE USING (owner_id = auth.uid());

-- 칸반 관련: 워크스페이스 멤버만 전체 권한
CREATE POLICY "kanban_boards_member_all" ON public.kanban_boards
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE POLICY "kanban_columns_member_all" ON public.kanban_columns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.kanban_boards b
      WHERE b.id = kanban_columns.board_id
        AND public.is_workspace_member(b.workspace_id)
    )
  );

CREATE POLICY "clients_member_all" ON public.clients
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE POLICY "cases_member_all" ON public.cases
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE POLICY "events_member_all" ON public.events
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tickets_member_all" ON public.tickets
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE POLICY "ticket_activities_member_all" ON public.ticket_activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_activities.ticket_id
        AND public.is_workspace_member(t.workspace_id)
    )
  );
