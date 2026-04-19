-- 온톨로지 v0.3 — 범용 레이어 (Lead·Communication·Payment·Action·Role)
-- 출처: ONTOLOGY_v0.3.md
-- 호환: additive-only (기존 rehab_* 불변)

BEGIN;

-- =========================================================================
-- 0. Role — workspace_members 확장 + 복수 역할 지원
-- =========================================================================

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'managing_partner'
    CHECK (role IN (
      'managing_partner','attorney','consultant',
      'document_staff','analysis_staff','correction_staff',
      'billing_staff','admin'
    ));

CREATE TABLE IF NOT EXISTS public.workspace_member_roles (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'managing_partner','attorney','consultant',
    'document_staff','analysis_staff','correction_staff',
    'billing_staff','admin'
  )),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (workspace_id, user_id, role)
);
ALTER TABLE public.workspace_member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wmr_member_read" ON public.workspace_member_roles
  FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "wmr_admin_write" ON public.workspace_member_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_member_roles.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('managing_partner')
    )
  );

-- 초기화: 기존 멤버를 workspace_member_roles에 managing_partner로 복사
INSERT INTO public.workspace_member_roles (workspace_id, user_id, role, granted_by)
SELECT workspace_id, user_id, 'managing_partner', user_id
FROM public.workspace_members
ON CONFLICT DO NOTHING;

-- 역할 체크 헬퍼
CREATE OR REPLACE FUNCTION public.has_role(ws UUID, r TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_member_roles
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = r
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(ws UUID, roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_member_roles
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = ANY(roles)
  )
$$;

-- =========================================================================
-- 1. Lead (수임 전)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  contact_secondary TEXT,
  source TEXT CHECK (source IN (
    'phone','kakao_ads','blog','referral','walk_in','naver','google','other'
  )),
  assigned_consultant_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','contacted','qualified','converted','lost','cold'
  )),
  case_type_hint TEXT,
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  lost_reason TEXT CHECK (lost_reason IS NULL OR lost_reason IN (
    'fee_mismatch','competitor','cooled_off','ineligible','no_response','other'
  )),
  converted_at TIMESTAMPTZ,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  notes TEXT,
  triage_score INT,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('high','normal','low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_consultant ON public.leads(workspace_id, assigned_consultant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(workspace_id, status, last_contact_at);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_member_all" ON public.leads
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 2. Communication (다형)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('lead','client','case')),
  subject_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call','kakao','sms','email','visit','letter')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT,
  content TEXT,
  duration_seconds INT,
  attachment_ids UUID[] DEFAULT '{}',
  logged_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  auto_captured BOOLEAN NOT NULL DEFAULT false,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comms_subject ON public.communications(subject_type, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_comms_workspace ON public.communications(workspace_id, occurred_at DESC);
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comms_member_all" ON public.communications
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 3. PaymentContract (계약) + PaymentSchedule (회차)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  total_amount_krw BIGINT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('lump_sum','installment','conditional')),
  installment_count INT NOT NULL DEFAULT 1,
  first_due_date DATE,
  cycle_days INT,
  payment_gate TEXT NOT NULL DEFAULT 'hard' CHECK (payment_gate IN ('hard','soft')),
  auto_dunning_enabled BOOLEAN NOT NULL DEFAULT true,
  dunning_schedule_days INT[] NOT NULL DEFAULT '{1,3,7,14}',
  dunning_template_ids TEXT[] DEFAULT '{}',
  signed_at TIMESTAMPTZ,
  signed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pmt_contracts_case ON public.payment_contracts(case_id);
ALTER TABLE public.payment_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmt_contracts_member_all" ON public.payment_contracts
  FOR ALL USING (public.is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.payment_contracts(id) ON DELETE CASCADE,
  installment_no INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('retainer','installment','success_fee','court_fee','misc')),
  amount_krw BIGINT NOT NULL,
  paid_amount_krw BIGINT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled','partial','paid','overdue','waived','refunded'
  )),
  dunning_count INT NOT NULL DEFAULT 0,
  last_dunning_at TIMESTAMPTZ,
  next_dunning_at TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN (
    'bank_transfer','card','cash','check'
  )),
  invoice_issued BOOLEAN NOT NULL DEFAULT false,
  gate_blocks_stages TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, installment_no)
);
CREATE INDEX IF NOT EXISTS idx_pmt_schedules_case ON public.payment_schedules(case_id, status);
CREATE INDEX IF NOT EXISTS idx_pmt_schedules_due ON public.payment_schedules(workspace_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_pmt_schedules_dunning ON public.payment_schedules(workspace_id, status, next_dunning_at)
  WHERE status = 'overdue';
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmt_schedules_member_all" ON public.payment_schedules
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 4. Action (범용 업무 실행 단위, 다형)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('lead','case','client','payment_schedule')),
  subject_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  team_role TEXT CHECK (team_role IS NULL OR team_role IN (
    'managing_partner','attorney','consultant',
    'document_staff','analysis_staff','correction_staff',
    'billing_staff','admin'
  )),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','doing','blocked','done','cancelled'
  )),
  priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  payload JSONB NOT NULL DEFAULT '{}',
  parent_action_id UUID REFERENCES public.actions(id) ON DELETE SET NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  blocking_reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_subject ON public.actions(subject_type, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_assignee ON public.actions(workspace_id, assigned_to, status, due_date);
CREATE INDEX IF NOT EXISTS idx_actions_team ON public.actions(workspace_id, team_role, status);
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "actions_member_all" ON public.actions
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 5. Case 팀 할당 (다중 담당)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.case_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  team_role TEXT NOT NULL CHECK (team_role IN (
    'managing_partner','attorney','consultant',
    'document_staff','analysis_staff','correction_staff',
    'billing_staff','admin'
  )),
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE(case_id, team_role)
);
CREATE INDEX IF NOT EXISTS idx_cta_case ON public.case_team_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_cta_user ON public.case_team_assignments(workspace_id, assigned_user_id);
ALTER TABLE public.case_team_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cta_member_all" ON public.case_team_assignments
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 6. 메타 레이어 — Action Registry, Dashboard Config, Stage/Doc/Risk 시드
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.action_registry (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  subject_types TEXT[] NOT NULL,
  allowed_roles TEXT[] NOT NULL,
  required_params JSONB NOT NULL DEFAULT '{}',
  produces JSONB NOT NULL DEFAULT '{}',
  auto_trigger JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- public read (registry는 글로벌 카탈로그)
ALTER TABLE public.action_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_registry_read" ON public.action_registry FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,   -- NULL = 글로벌 기본
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  sections JSONB NOT NULL,                                                -- DashboardSection[]
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_role ON public.dashboard_configs(role, workspace_id);
ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dashboard_configs_read" ON public.dashboard_configs
  FOR SELECT USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.stage_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  order_index INT NOT NULL,
  phase TEXT,
  primary_role TEXT,
  typical_duration_days INT,
  is_bypass BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  UNIQUE(domain, key)
);
ALTER TABLE public.stage_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_def_read" ON public.stage_definitions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.stage_transitions_def (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  condition TEXT,
  is_bypass BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(domain, from_stage, to_stage)
);
ALTER TABLE public.stage_transitions_def ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_trans_read" ON public.stage_transitions_def FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.document_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  category TEXT,
  used_in_stages TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(domain, key)
);
ALTER TABLE public.document_type_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctype_def_read" ON public.document_type_definitions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.risk_flag_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('red','yellow')),
  description TEXT,
  response TEXT,
  activates_actions TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(domain, key)
);
ALTER TABLE public.risk_flag_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riskflag_def_read" ON public.risk_flag_definitions FOR SELECT USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
