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
