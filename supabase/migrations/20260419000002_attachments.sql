-- 첨부 파일 (Supabase Storage 연동)
-- 버킷은 대시보드에서 만들어야 함: public.attachments (Private)

CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- Storage 객체 경로 (예: workspace_id/ticket_id/uuid.pdf)
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,

  -- 어느 엔티티에 붙어있는지 (하나만 non-null)
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,

  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  CHECK (
    (ticket_id IS NOT NULL)::int +
    (case_id IS NOT NULL)::int +
    (event_id IS NOT NULL)::int +
    (client_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON public.attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_case ON public.attachments(case_id);
CREATE INDEX IF NOT EXISTS idx_attachments_event ON public.attachments(event_id);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON public.attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_attachments_workspace ON public.attachments(workspace_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_member_all" ON public.attachments
  FOR ALL USING (public.is_workspace_member(workspace_id));
