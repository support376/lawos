-- LawOS — 스키마 현행화 (여러 번 실행 안전, 순수 DDL)
-- 트리거 함수는 건드리지 않음. 필요한 컬럼/제약/테이블만.

-- ============ cases 확장 ============
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS court TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opposing_party TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS retainer_date DATE;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS closed_date DATE;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS assigned_to UUID
  REFERENCES public.users(id) ON DELETE SET NULL;

-- ============ events 확장 ============
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- events.source_type CHECK 재작성
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_type_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_source_type_check
    CHECK (source_type IN (
      'audio_upload', 'email', 'kakao', 'realtime_audio',
      'manual', 'custom', 'milestone', 'import',
      'phone', 'notes', 'sms', 'voice', 'copilot'
    ));

-- ============ workspace_members 역할 확장 ============
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));

-- ============ workspace_invites 테이블 ============
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invites_email
  ON public.workspace_invites(email) WHERE accepted_at IS NULL;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- RLS 헬퍼 함수 (admin 권한 체크)
CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$func$;

-- invites RLS 정책 (재생성)
DROP POLICY IF EXISTS "invites_members_select" ON public.workspace_invites;
CREATE POLICY "invites_members_select" ON public.workspace_invites
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "invites_admin_all" ON public.workspace_invites;
CREATE POLICY "invites_admin_all" ON public.workspace_invites
  FOR ALL USING (public.is_workspace_admin(workspace_id));

-- ============ 인덱스 ============
CREATE INDEX IF NOT EXISTS idx_events_case_occurred
  ON public.events(case_id, occurred_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_client
  ON public.events(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_type ON public.cases(case_type, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to
  ON public.cases(assigned_to, workspace_id);
