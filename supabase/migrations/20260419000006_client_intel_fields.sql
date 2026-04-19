-- LawOS: 의뢰인 인텔 구조화
-- clients 테이블에 재무/인적/자유메모 필드 추가
-- cases 테이블에 free_notes (자유 텍스트 편집) 추가

-- clients: 재무/인적 구조화 필드
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS monthly_income_krw BIGINT,
  ADD COLUMN IF NOT EXISTS total_debt_krw BIGINT,
  ADD COLUMN IF NOT EXISTS dependents_count INTEGER,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_flags JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intel_updated_at TIMESTAMPTZ;

-- cases: 자유 텍스트 사건 노트 (텍스트 편집 가능)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS free_notes TEXT;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
