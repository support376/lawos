-- 상담일지 — 상담원이 자유 텍스트로 6섹션 작성
-- 현재는 단순 textarea 저장. 향후 통화 녹음·음성 STT 결과가 여기로 인입될 예정.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consultation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  consultant_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  consultation_date DATE NOT NULL DEFAULT CURRENT_DATE,

  section_personal TEXT,      -- 인적사항 (성명·연락처·거주·가족·재신청이력)
  section_debt TEXT,          -- 채무상황 (총액·채권자·사유)
  section_assets TEXT,        -- 재산상황 (부동산·자동차·임대차·배우자·처분)
  section_income TEXT,        -- 소득상황 (급여·상여·4대보험·배우자소득)
  section_statement TEXT,     -- 진술서 기재사항 (과거소득·학력·소송)
  section_engagement TEXT,    -- 수임정보 (수임료·납부방법·쟁점 메모)

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_logs_lead ON public.consultation_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_consult_logs_case ON public.consultation_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_consult_logs_workspace ON public.consultation_logs(workspace_id, consultation_date DESC);

ALTER TABLE public.consultation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consult_logs_member_all" ON public.consultation_logs
  FOR ALL USING (public.is_workspace_member(workspace_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
