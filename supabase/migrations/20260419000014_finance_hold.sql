-- 재무팀 Finance Hold — Stage 전이 차단 권한
-- 원칙: 재무팀이 명시적으로 "작성 멈춤"을 걸 수 있음. 결제 상태와 별개로 작동.

BEGIN;

CREATE TABLE IF NOT EXISTS public.case_financial_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT NOT NULL,
  held_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  held_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_fh_case_active ON public.case_financial_holds(case_id, active);
CREATE INDEX IF NOT EXISTS idx_fh_workspace_active ON public.case_financial_holds(workspace_id, active);

ALTER TABLE public.case_financial_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fh_member_read" ON public.case_financial_holds FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "fh_billing_write" ON public.case_financial_holds FOR ALL USING (
  public.has_role(workspace_id, 'billing_staff') OR public.has_role(workspace_id, 'managing_partner')
);

COMMIT;

NOTIFY pgrst, 'reload schema';
