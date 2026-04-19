-- 객체 수준 권한 (변호사법 §26 비밀유지의무 대응)
-- cases.visibility로 사건 접근 범위 제어

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace'
  CHECK (visibility IN ('workspace', 'assigned_only', 'owner_only'));

-- 'workspace': 워크스페이스 멤버 전체 접근 (기본값, 소규모 사무소)
-- 'assigned_only': 담당자(assigned_to) + 워크스페이스 owner만
-- 'owner_only': 워크스페이스 owner만 (최고 기밀)

CREATE INDEX IF NOT EXISTS idx_cases_visibility
  ON public.cases(workspace_id, visibility);

-- RLS 재작성: visibility 반영
DROP POLICY IF EXISTS "cases_member_all" ON public.cases;

-- 읽기: 방식별로 다름
CREATE POLICY "cases_read" ON public.cases
  FOR SELECT USING (
    public.is_workspace_member(workspace_id) AND (
      visibility = 'workspace'
      OR (
        visibility = 'assigned_only'
        AND (
          assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = cases.workspace_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
          )
        )
      )
      OR (
        visibility = 'owner_only'
        AND EXISTS (
          SELECT 1 FROM public.workspace_members
          WHERE workspace_id = cases.workspace_id
            AND user_id = auth.uid()
            AND role = 'owner'
        )
      )
    )
  );

-- 쓰기 (insert/update/delete): owner/admin 또는 담당자
CREATE POLICY "cases_write" ON public.cases
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "cases_update" ON public.cases
  FOR UPDATE USING (
    public.is_workspace_member(workspace_id) AND (
      visibility = 'workspace'
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = cases.workspace_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "cases_delete" ON public.cases
  FOR DELETE USING (
    public.is_workspace_member(workspace_id) AND (
      EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = cases.workspace_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

-- 티켓 접근도 사건 visibility를 따름 (사건에 속한 티켓이라면)
DROP POLICY IF EXISTS "tickets_member_all" ON public.tickets;

CREATE POLICY "tickets_read" ON public.tickets
  FOR SELECT USING (
    public.is_workspace_member(workspace_id) AND (
      case_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = tickets.case_id
        -- 사건 접근 가능하면 티켓도 접근 가능 (cases RLS가 알아서 필터)
      )
    )
  );

CREATE POLICY "tickets_write" ON public.tickets
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tickets_delete" ON public.tickets
  FOR DELETE USING (public.is_workspace_member(workspace_id));
