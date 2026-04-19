-- LawOS V1 initial schema
-- Spec: lawos_kanban_spec.md §4.2

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- public.users: 프로필/메타. auth.users를 1:1 참조 (Supabase Auth 연동)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  auth_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_members (
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE public.kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('triage', 'todo', 'in_progress', 'review', 'done')),
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  color TEXT,
  UNIQUE (board_id, key)
);

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  case_type TEXT,
  stage TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('audio_upload', 'email', 'kakao', 'realtime_audio', 'manual', 'custom')),
  raw_content TEXT,
  metadata JSONB,
  client_id UUID REFERENCES public.clients(id),
  case_id UUID REFERENCES public.cases(id),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  board_id UUID REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL CHECK (column_key IN ('triage', 'todo', 'in_progress', 'review', 'done')),
  "order" INTEGER NOT NULL,

  case_id UUID REFERENCES public.cases(id),
  client_id UUID REFERENCES public.clients(id),

  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('promise', 'document_request', 'follow_up')),
  priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),

  due_date DATE,
  waiting_on TEXT CHECK (waiting_on IN ('client', 'court', 'opposing') OR waiting_on IS NULL),

  source_event_id UUID REFERENCES public.events(id),
  ai_suggested BOOLEAN DEFAULT false,
  ai_reasoning TEXT,
  ai_confidence NUMERIC(3,2),

  draft_payload JSONB,
  action_type TEXT CHECK (action_type IN ('send_email', 'create_calendar', 'manual') OR action_type IS NULL),

  assigned_to UUID REFERENCES public.users(id),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tickets_board_column ON public.tickets(board_id, column_key, "order");
CREATE INDEX idx_tickets_case ON public.tickets(case_id);
CREATE INDEX idx_tickets_client ON public.tickets(client_id);
CREATE INDEX idx_tickets_workspace ON public.tickets(workspace_id);

CREATE TABLE public.ticket_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'moved', 'edited', 'approved', 'rejected', 'sent', 'executed')),
  from_value JSONB,
  to_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ticket_activities_ticket ON public.ticket_activities(ticket_id, created_at DESC);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
-- LawOS V1 가입 자동 프로비저닝
-- Spec: lawos_kanban_spec.md §3.1
-- auth.users INSERT 시: public.users + workspace + members + board + 5 columns 생성 (단일 트랜잭션)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_board_id UUID;
  v_user_name TEXT;
  v_provider TEXT;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  v_provider := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    'email'
  );

  -- 1) 프로필
  INSERT INTO public.users (id, email, name, auth_provider)
  VALUES (NEW.id, NEW.email, v_user_name, v_provider);

  -- 2) 워크스페이스
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (v_user_name || '의 워크스페이스', NEW.id)
  RETURNING id INTO v_workspace_id;

  -- 3) 멤버십
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');

  -- 4) 기본 보드
  INSERT INTO public.kanban_boards (workspace_id, name)
  VALUES (v_workspace_id, '내 사건 관리')
  RETURNING id INTO v_board_id;

  -- 5) 기본 5컬럼
  INSERT INTO public.kanban_columns (board_id, key, name, "order", color) VALUES
    (v_board_id, 'triage',      'Triage',        1, 'gray'),
    (v_board_id, 'todo',        'To Do',         2, 'blue'),
    (v_board_id, 'in_progress', 'In Progress',   3, 'amber'),
    (v_board_id, 'review',      'Review & Send', 4, 'purple'),
    (v_board_id, 'done',        'Done',          5, 'green');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
