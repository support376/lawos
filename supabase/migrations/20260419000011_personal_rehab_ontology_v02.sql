-- 개인회생 온톨로지 v0.2 — 13 엔티티 DB 스키마
-- 출처: personal_rehab_ontology_v0.2.html (Circle21 · 웰컴법률사무소)
-- 모든 테이블은 rehab_ 프리픽스. 각 테이블엔 workspace_id RLS.

BEGIN;

-- =========================================================================
-- 1. rehab_debtors (Debtor, 1:1 with cases)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,

  -- 식별
  name TEXT NOT NULL,
  rrn_encrypted TEXT,
  age INT,
  gender TEXT CHECK (gender IN ('M', 'F', 'other')),
  contact TEXT,

  -- 주거
  residence_type TEXT CHECK (residence_type IN ('owned', 'jeonse', 'monthly_rent', 'other')),
  deposit_amount_krw BIGINT,

  -- 직업 (복합)
  job_types TEXT[] NOT NULL DEFAULT '{}',

  -- 적격성 (5)
  has_prior_discharge_within_5y BOOLEAN NOT NULL DEFAULT false,
  has_regular_income BOOLEAN NOT NULL DEFAULT false,
  is_business_income_earner BOOLEAN NOT NULL DEFAULT false,
  unsecured_debt_cap_ok BOOLEAN NOT NULL DEFAULT true,
  secured_debt_cap_ok BOOLEAN NOT NULL DEFAULT true,

  -- 리스크 (7)
  has_tax_arrears BOOLEAN NOT NULL DEFAULT false,
  has_insurance_arrears BOOLEAN NOT NULL DEFAULT false,
  has_criminal_case BOOLEAN NOT NULL DEFAULT false,
  preferential_transfer_risk BOOLEAN NOT NULL DEFAULT false,
  fraudulent_transfer_risk BOOLEAN NOT NULL DEFAULT false,
  has_guarantor BOOLEAN NOT NULL DEFAULT false,
  recent_loan_within_3m BOOLEAN NOT NULL DEFAULT false,

  -- 단축계획 자격 (6)
  is_under_30 BOOLEAN NOT NULL DEFAULT false,
  is_over_65 BOOLEAN NOT NULL DEFAULT false,
  is_single_parent BOOLEAN NOT NULL DEFAULT false,
  has_2plus_minor_children BOOLEAN NOT NULL DEFAULT false,
  is_jeonse_fraud_victim BOOLEAN NOT NULL DEFAULT false,
  is_severely_disabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_debtors_case ON public.rehab_debtors(case_id);
ALTER TABLE public.rehab_debtors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_debtors_member_all" ON public.rehab_debtors
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 2. rehab_debts (Debt, N per case)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'general_unsecured', 'secured', 'priority', 'tax', 'non_dischargeable', 'private_loan'
  )),
  creditor_name TEXT NOT NULL,
  creditor_type TEXT CHECK (creditor_type IN ('bank','card','private','tax_authority','criminal','other')),
  principal_krw BIGINT NOT NULL DEFAULT 0,
  interest_krw BIGINT NOT NULL DEFAULT 0,
  overdue_interest_krw BIGINT NOT NULL DEFAULT 0,
  origin_date DATE,
  last_payment_date DATE,
  cause TEXT,

  has_collateral BOOLEAN NOT NULL DEFAULT false,
  collateral_asset_id UUID,  -- FK set after rehab_assets created

  is_in_collection BOOLEAN NOT NULL DEFAULT false,
  is_litigated BOOLEAN NOT NULL DEFAULT false,
  judgment_finalized BOOLEAN NOT NULL DEFAULT false,
  has_guarantor BOOLEAN NOT NULL DEFAULT false,
  statute_of_limitations_expired BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_debts_case ON public.rehab_debts(case_id);
CREATE INDEX IF NOT EXISTS idx_rehab_debts_type ON public.rehab_debts(case_id, type);
ALTER TABLE public.rehab_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_debts_member_all" ON public.rehab_debts
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 3. rehab_assets (Asset, N per case)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'real_estate','deposit','security_deposit','insurance_surrender',
    'vehicle','retirement','business_asset','receivable'
  )),
  label TEXT NOT NULL,
  market_value_krw BIGINT NOT NULL DEFAULT 0,
  liquidation_value_krw BIGINT NOT NULL DEFAULT 0,
  exempt_amount_krw BIGINT NOT NULL DEFAULT 0,
  secured_claims_on_asset_krw BIGINT NOT NULL DEFAULT 0,
  pending_confirmation BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_assets_case ON public.rehab_assets(case_id);
ALTER TABLE public.rehab_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_assets_member_all" ON public.rehab_assets
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- rehab_debts.collateral_asset_id FK (순환 회피로 여기서 추가)
ALTER TABLE public.rehab_debts
  ADD CONSTRAINT rehab_debts_collateral_fk
  FOREIGN KEY (collateral_asset_id) REFERENCES public.rehab_assets(id) ON DELETE SET NULL;

-- =========================================================================
-- 4. rehab_incomes (Income, N per case — 복합 허용)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN ('earned','business','freelance','public_benefit')),
  monthly_amount_krw BIGINT NOT NULL DEFAULT 0,   -- 세후 기준
  is_regular BOOLEAN NOT NULL DEFAULT false,
  is_documented BOOLEAN NOT NULL DEFAULT false,
  declared_for_intake_krw BIGINT,                 -- 인테이크 의뢰인 유리액
  bank_evidence_amount_krw BIGINT,                -- 계좌내역 실증액

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_incomes_case ON public.rehab_incomes(case_id);
ALTER TABLE public.rehab_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_incomes_member_all" ON public.rehab_incomes
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 5. rehab_dependents (Dependent, N per case)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  relation TEXT NOT NULL CHECK (relation IN ('spouse','child','parent','other')),
  age INT,
  is_cohabiting BOOLEAN NOT NULL DEFAULT true,
  has_own_income BOOLEAN NOT NULL DEFAULT false,
  is_minor BOOLEAN NOT NULL DEFAULT false,
  young_adult_dependent_claim BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_dependents_case ON public.rehab_dependents(case_id);
ALTER TABLE public.rehab_dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_dependents_member_all" ON public.rehab_dependents
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 6. rehab_case_details (Case 확장 — 개인회생 전용 1:1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_case_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,

  rehab_case_type TEXT NOT NULL DEFAULT 'personal_rehab'
    CHECK (rehab_case_type IN ('personal_rehab','general_rehab','bankruptcy_discharge','small_business_rehab')),
  trustee_name TEXT,
  filing_date DATE,
  opening_date DATE,
  approval_date DATE,
  discharge_date DATE,
  current_stage_key TEXT,                                  -- StageKey

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_case_details_case ON public.rehab_case_details(case_id);
ALTER TABLE public.rehab_case_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_case_details_member_all" ON public.rehab_case_details
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 7. rehab_repayment_plans (RepaymentPlan, 버전 이력)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_repayment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  plan_period_months INT NOT NULL CHECK (plan_period_months IN (24, 36, 60)),
  monthly_payment_krw BIGINT NOT NULL,
  total_payment_krw BIGINT NOT NULL,
  repayment_ratio NUMERIC(6, 5) NOT NULL,                  -- 0.00000 ~ 1.00000
  structure TEXT NOT NULL DEFAULT 'equal' CHECK (structure IN ('equal','graduated')),
  liquidation_value_guaranteed BOOLEAN NOT NULL,
  shortening_reason TEXT,                                  -- DebtorShorteningEligibility key
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_repayment_plans_case ON public.rehab_repayment_plans(case_id, version DESC);
ALTER TABLE public.rehab_repayment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_repayment_plans_member_all" ON public.rehab_repayment_plans
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 8. rehab_documents (Document 요구사항 체크리스트 — attachments와 별개)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  doc_type TEXT NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  uploaded BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(case_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_rehab_documents_case ON public.rehab_documents(case_id);
ALTER TABLE public.rehab_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_documents_member_all" ON public.rehab_documents
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 9. rehab_stage_history (Stage 전이 이력)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  stage_key TEXT NOT NULL,
  entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_date TIMESTAMPTZ,
  required_actions TEXT[] NOT NULL DEFAULT '{}',
  blocking_issues TEXT[] NOT NULL DEFAULT '{}',
  responsible_actor TEXT CHECK (responsible_actor IN ('debtor','attorney','court','trustee','creditor')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_stage_history_case ON public.rehab_stage_history(case_id, entry_date DESC);
ALTER TABLE public.rehab_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_stage_history_member_all" ON public.rehab_stage_history
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 10. rehab_interactions (Interaction — 보정·즉시항고·응답 등)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'correction_recommendation','opinion_request','status_report',
    'objection','response','immediate_appeal'
  )),
  iteration_number INT NOT NULL DEFAULT 1,
  initiator TEXT NOT NULL CHECK (initiator IN ('debtor','attorney','court','trustee','creditor')),
  recipient TEXT NOT NULL CHECK (recipient IN ('debtor','attorney','court','trustee','creditor')),
  due_date DATE,
  response_date DATE,
  items TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','accepted','rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_interactions_case ON public.rehab_interactions(case_id, created_at DESC);
ALTER TABLE public.rehab_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_interactions_member_all" ON public.rehab_interactions
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 11. rehab_court_orders (CourtOrder)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_court_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  order_type TEXT NOT NULL CHECK (order_type IN (
    'correction_rec','dismissal','dismissal_revoked','opening_decision',
    'plan_approval','termination','modification_approval','discharge'
  )),
  issued_date DATE NOT NULL,
  required_actions TEXT[] NOT NULL DEFAULT '{}',
  deadline DATE,
  appealable BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_court_orders_case ON public.rehab_court_orders(case_id, issued_date DESC);
ALTER TABLE public.rehab_court_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_court_orders_member_all" ON public.rehab_court_orders
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 12. rehab_repayment_events (RepaymentEvent — 월별 변제 로그)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_repayment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'payment_completed','payment_delayed','income_change',
    'modification_request','termination_warning'
  )),
  event_date DATE NOT NULL,
  amount_krw BIGINT,
  reason TEXT,
  evidence TEXT,
  triggered_actions TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_repayment_events_case ON public.rehab_repayment_events(case_id, event_date DESC);
ALTER TABLE public.rehab_repayment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_repayment_events_member_all" ON public.rehab_repayment_events
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- =========================================================================
-- 13. rehab_actors (Actor — 회생위원·채권자 연락처·대리인 등)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rehab_actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  actor_type TEXT NOT NULL CHECK (actor_type IN ('debtor','attorney','court','trustee','creditor')),
  name TEXT NOT NULL,
  contact_channel TEXT CHECK (contact_channel IN ('ecourt','kakao','paper','in_person','phone','email')),
  responsibilities TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rehab_actors_case ON public.rehab_actors(case_id, actor_type);
ALTER TABLE public.rehab_actors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rehab_actors_member_all" ON public.rehab_actors
  FOR ALL USING (public.is_workspace_member(workspace_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
