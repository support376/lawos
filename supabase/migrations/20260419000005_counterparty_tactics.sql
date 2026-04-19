-- 상대방 프로필 + 채택된 전술 트래킹
-- 윤리 가드레일: 의뢰인 동의 기록 필수, 모든 인텔에 출처 + 적법성 태그

CREATE TABLE IF NOT EXISTS public.case_counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,                -- 피고, 배우자, 채권자, 검사 측 등
  description TEXT,

  -- 프로필 (구조화된 JSONB)
  -- { weaknesses: [{label, source_type, legality, notes, added_at, added_by}],
  --   personality_tags: string[],
  --   resources: { legal_team_level?, financial_capacity?, notes? },
  --   relationships: [{role, name, relevance}] }
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 의뢰인 동의 (변호사법/개인정보 보호 차원)
  consent_recorded BOOLEAN NOT NULL DEFAULT false,
  consent_recorded_at TIMESTAMPTZ,
  consent_recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  consent_scope TEXT,       -- "공개정보 + 합법 탐정조사" 등 명시

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counterparties_case
  ON public.case_counterparties(case_id);
CREATE INDEX IF NOT EXISTS idx_counterparties_workspace
  ON public.case_counterparties(workspace_id);

ALTER TABLE public.case_counterparties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "counterparties_member" ON public.case_counterparties;
CREATE POLICY "counterparties_member" ON public.case_counterparties
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- ============ 채택된 전술 ============
CREATE TABLE IF NOT EXISTS public.case_tactics_adopted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES public.case_counterparties(id) ON DELETE SET NULL,
  tactic_key TEXT NOT NULL,          -- Tactic 카탈로그의 key
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'executing', 'completed', 'abandoned')),
  adopted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  adopted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome TEXT,                      -- win, lose, partial, settled, 기각 등
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_tactics_adopted_case
  ON public.case_tactics_adopted(case_id, adopted_at DESC);

ALTER TABLE public.case_tactics_adopted ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tactics_adopted_member" ON public.case_tactics_adopted;
CREATE POLICY "tactics_adopted_member" ON public.case_tactics_adopted
  FOR ALL USING (public.is_workspace_member(workspace_id));
