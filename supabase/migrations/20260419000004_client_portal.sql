-- 고객 포털: magic link로 로그인 없이 서류 업로드 가능
CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON public.client_portal_tokens(token)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_tokens_case ON public.client_portal_tokens(case_id);

ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_tokens_member" ON public.client_portal_tokens;
CREATE POLICY "portal_tokens_member" ON public.client_portal_tokens
  FOR ALL USING (public.is_workspace_member(workspace_id));
