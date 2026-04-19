-- LawOS — 최신 스키마 보장 (idempotent, 여러 번 실행 안전)
-- 이전 설치가 어느 버전이든 이 파일 하나 돌리면 최신.

-- ============ 1. cases 컬럼 확장 ============
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS court TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opposing_party TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS retainer_date DATE;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS closed_date DATE;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS assigned_to UUID
  REFERENCES public.users(id) ON DELETE SET NULL;

-- visibility (객체 수준 권한)
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS visibility TEXT;
UPDATE public.cases SET visibility = 'workspace' WHERE visibility IS NULL;
ALTER TABLE public.cases ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE public.cases ALTER COLUMN visibility SET DEFAULT 'workspace';
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_visibility_check;
ALTER TABLE public.cases ADD CONSTRAINT cases_visibility_check
  CHECK (visibility IN ('workspace', 'assigned_only', 'owner_only'));

-- workflow 상태
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS workflow_stage TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS workflow_docs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS workflow_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS workflow_template_version INTEGER;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS free_notes TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_intel JSONB DEFAULT '{}'::jsonb;

-- case_counterparties 테이블 (Actor 저장소)
CREATE TABLE IF NOT EXISTS public.case_counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_recorded BOOLEAN NOT NULL DEFAULT false,
  consent_recorded_at TIMESTAMPTZ,
  consent_recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  consent_scope TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_counterparties_case ON public.case_counterparties(case_id);
CREATE INDEX IF NOT EXISTS idx_counterparties_workspace ON public.case_counterparties(workspace_id);
ALTER TABLE public.case_counterparties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counterparties_member" ON public.case_counterparties;
CREATE POLICY "counterparties_member" ON public.case_counterparties
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Actor 가중치 컬럼
ALTER TABLE public.case_counterparties ADD COLUMN IF NOT EXISTS weight TEXT DEFAULT 'primary';
ALTER TABLE public.case_counterparties DROP CONSTRAINT IF EXISTS case_counterparties_weight_check;
ALTER TABLE public.case_counterparties ADD CONSTRAINT case_counterparties_weight_check
  CHECK (weight IN ('primary', 'secondary', 'background'));

-- case_tactics_adopted 테이블
CREATE TABLE IF NOT EXISTS public.case_tactics_adopted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES public.case_counterparties(id) ON DELETE SET NULL,
  tactic_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'executing', 'completed', 'abandoned')),
  adopted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  adopted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_tactics_adopted_case
  ON public.case_tactics_adopted(case_id, adopted_at DESC);
ALTER TABLE public.case_tactics_adopted ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactics_adopted_member" ON public.case_tactics_adopted;
CREATE POLICY "tactics_adopted_member" ON public.case_tactics_adopted
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- clients: 의뢰인 인텔 (재무/인적/위험신호)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS monthly_income_krw BIGINT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_debt_krw BIGINT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS dependents_count INTEGER;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS risk_flags JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS intel_updated_at TIMESTAMPTZ;

-- ============ 2. events 컬럼 & CHECK ============
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_source_type_check
  CHECK (source_type IN (
    'audio_upload', 'email', 'kakao', 'realtime_audio', 'manual',
    'custom', 'milestone', 'import', 'phone', 'notes', 'sms', 'voice', 'copilot'
  ));

-- ============ 3. workspace_members 역할 ============
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- ============ 4. workspace_invites ============
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

-- ============ 5. attachments ============
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON public.attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_case ON public.attachments(case_id);
CREATE INDEX IF NOT EXISTS idx_attachments_event ON public.attachments(event_id);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON public.attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_attachments_workspace ON public.attachments(workspace_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- ============ 6. RLS 헬퍼 함수 ============
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

-- ============ 7. RLS 정책 재생성 (idempotent) ============

-- invites
DROP POLICY IF EXISTS "invites_members_select" ON public.workspace_invites;
CREATE POLICY "invites_members_select" ON public.workspace_invites
  FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "invites_admin_all" ON public.workspace_invites;
CREATE POLICY "invites_admin_all" ON public.workspace_invites
  FOR ALL USING (public.is_workspace_admin(workspace_id));

-- attachments
DROP POLICY IF EXISTS "attachments_member_all" ON public.attachments;
CREATE POLICY "attachments_member_all" ON public.attachments
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- cases: visibility 반영
DROP POLICY IF EXISTS "cases_member_all" ON public.cases;
DROP POLICY IF EXISTS "cases_read" ON public.cases;
DROP POLICY IF EXISTS "cases_write" ON public.cases;
DROP POLICY IF EXISTS "cases_update" ON public.cases;
DROP POLICY IF EXISTS "cases_delete" ON public.cases;

CREATE POLICY "cases_read" ON public.cases
  FOR SELECT USING (
    public.is_workspace_member(workspace_id) AND (
      visibility = 'workspace'
      OR (
        visibility = 'assigned_only'
        AND (
          assigned_to = auth.uid()
          OR public.is_workspace_admin(workspace_id)
        )
      )
      OR (
        visibility = 'owner_only'
        AND EXISTS (
          SELECT 1 FROM public.workspace_members
          WHERE workspace_id = cases.workspace_id
            AND user_id = auth.uid()
            AND role = 'owner'
        )
      )
    )
  );

CREATE POLICY "cases_write" ON public.cases
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "cases_update" ON public.cases
  FOR UPDATE USING (
    public.is_workspace_member(workspace_id) AND (
      visibility = 'workspace'
      OR assigned_to = auth.uid()
      OR public.is_workspace_admin(workspace_id)
    )
  );

CREATE POLICY "cases_delete" ON public.cases
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- tickets RLS
DROP POLICY IF EXISTS "tickets_member_all" ON public.tickets;
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_write" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete" ON public.tickets;

CREATE POLICY "tickets_read" ON public.tickets
  FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "tickets_write" ON public.tickets
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "tickets_delete" ON public.tickets
  FOR DELETE USING (public.is_workspace_member(workspace_id));

-- ============ 8. 인덱스 ============
CREATE INDEX IF NOT EXISTS idx_events_case_occurred
  ON public.events(case_id, occurred_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_client ON public.events(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_type ON public.cases(case_type, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_visibility ON public.cases(workspace_id, visibility);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON public.cases(assigned_to, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_workflow_stage ON public.cases(workflow_stage, workspace_id);
