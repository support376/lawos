-- auth.users 삭제 시 public FK 체인이 막히는 문제 수정
-- workspaces.owner_id, tickets.assigned_to/created_by, ticket_activities.actor_id
-- 에 CASCADE / SET NULL 적절히 붙임

-- 워크스페이스: 오너가 사라지면 워크스페이스도 사라짐 (V1은 1인 소유)
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 티켓: 담당자/생성자가 사라져도 티켓은 남김 (이력 보존)
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_created_by_fkey;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 활동 로그: 작성자가 사라져도 로그는 남김
ALTER TABLE public.ticket_activities
  DROP CONSTRAINT IF EXISTS ticket_activities_actor_id_fkey;
ALTER TABLE public.ticket_activities
  ADD CONSTRAINT ticket_activities_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
