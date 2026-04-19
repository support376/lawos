-- 온톨로지 프레임워크: 사건별 워크플로우 상태 저장
-- 템플릿 자체는 코드에 하드코딩 (V2에서 DB로 이관 가능)
-- 사건 인스턴스의 진행 상태만 DB에 보관.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT,
  ADD COLUMN IF NOT EXISTS workflow_docs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS workflow_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS workflow_template_version INTEGER;

-- workflow_docs 구조:
--   { 'resident_reg': { status: 'received', received_at: ..., attachment_ids: [...] }, ... }
--
-- workflow_history 구조:
--   [{ stage: 'consultation', entered_at: '...', exited_at: '...' }, ...]

CREATE INDEX IF NOT EXISTS idx_cases_workflow_stage
  ON public.cases(workflow_stage, workspace_id);
