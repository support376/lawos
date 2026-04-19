-- Actor 가중치 컬럼 추가 (case_counterparties 재활용)
-- 기존 role TEXT + profile JSONB 그대로 사용 (intel 저장소).

ALTER TABLE public.case_counterparties
  ADD COLUMN IF NOT EXISTS weight TEXT DEFAULT 'primary'
    CHECK (weight IN ('primary', 'secondary', 'background'));

CREATE INDEX IF NOT EXISTS idx_counterparties_role_weight
  ON public.case_counterparties(case_id, role, weight);

NOTIFY pgrst, 'reload schema';
