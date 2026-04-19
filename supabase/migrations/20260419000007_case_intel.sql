-- 사건 특수 인텔 저장 (도메인별 caseFields)
-- 예: 이혼의 marriage_years, separation_months, children_count 등

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_intel JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
