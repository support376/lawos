-- 사건 메타 확장 + milestone 이벤트 허용

-- cases에 실제 사건 정보 필드 추가
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_number TEXT,
  ADD COLUMN IF NOT EXISTS court TEXT,
  ADD COLUMN IF NOT EXISTS opposing_party TEXT,
  ADD COLUMN IF NOT EXISTS retainer_date DATE,
  ADD COLUMN IF NOT EXISTS closed_date DATE,
  ADD COLUMN IF NOT EXISTS outcome TEXT;

-- events.source_type에 milestone 추가 (이력 타임라인용)
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_source_type_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_source_type_check
    CHECK (source_type IN (
      'audio_upload', 'email', 'kakao', 'realtime_audio',
      'manual', 'custom', 'milestone', 'import'
    ));

-- events에 이벤트 날짜 필드 추가 (created_at과 별개로 "언제 발생한 일"인지)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- 사건별 타임라인 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_events_case_occurred
  ON public.events(case_id, occurred_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_client
  ON public.events(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_type ON public.cases(case_type, workspace_id);
-- 팀 기능 + 초대 시스템

-- cases에 담당(주) 변호사 필드
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_assigned_to
  ON public.cases(assigned_to, workspace_id);

-- workspace_members 역할 확장 (owner/admin/member)
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));

-- 초대 테이블 (가입 전 pending 상태)
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invites_email ON public.workspace_invites(email) WHERE accepted_at IS NULL;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_members_select" ON public.workspace_invites
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- owner/admin만 초대 관리
CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

CREATE POLICY "invites_admin_all" ON public.workspace_invites
  FOR ALL USING (public.is_workspace_admin(workspace_id));

-- 가입 트리거 재정의: 초대 있으면 해당 워크스페이스에 합류, 없으면 기존대로 신규 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_board_id UUID;
  v_user_name TEXT;
  v_provider TEXT;
  v_invite_ws UUID;
  v_invite_role TEXT;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  v_provider := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    'email'
  );

  -- 1) 프로필 (공통)
  INSERT INTO public.users (id, email, name, auth_provider)
  VALUES (NEW.id, NEW.email, v_user_name, v_provider);

  -- 2) 초대 확인 (이메일 매칭, accepted_at NULL)
  SELECT workspace_id, role
    INTO v_invite_ws, v_invite_role
  FROM public.workspace_invites
  WHERE email = NEW.email AND accepted_at IS NULL
  ORDER BY invited_at DESC
  LIMIT 1;

  IF v_invite_ws IS NOT NULL THEN
    -- 초대받은 워크스페이스에 합류
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_invite_ws, NEW.id, v_invite_role)
    ON CONFLICT DO NOTHING;

    UPDATE public.workspace_invites
      SET accepted_at = now()
      WHERE workspace_id = v_invite_ws AND email = NEW.email;
  ELSE
    -- 초대 없음: 신규 워크스페이스 + 보드 + 5컬럼
    INSERT INTO public.workspaces (name, owner_id)
    VALUES (v_user_name || '의 워크스페이스', NEW.id)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, NEW.id, 'owner');

    INSERT INTO public.kanban_boards (workspace_id, name)
    VALUES (v_workspace_id, '내 사건 관리')
    RETURNING id INTO v_board_id;

    INSERT INTO public.kanban_columns (board_id, key, name, "order", color) VALUES
      (v_board_id, 'triage',      'Triage',        1, 'gray'),
      (v_board_id, 'todo',        'To Do',         2, 'blue'),
      (v_board_id, 'in_progress', 'In Progress',   3, 'amber'),
      (v_board_id, 'review',      'Review & Send', 4, 'purple'),
      (v_board_id, 'done',        'Done',          5, 'green');
  END IF;

  RETURN NEW;
END;
$$;

-- 트리거는 이미 존재 (재정의만)
