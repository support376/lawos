-- 이혼 도메인 Actor 역할 리네이밍 (v0.3 → v0.4)
-- 옛날 role (client_self / spouse / client) 정리 + 새 role로 통일.
-- 새 our_side/opposing_side가 ensureDomainActors에 의해 이미 auto-create되어 있을 수 있어
-- 중복 방지를 위해 먼저 삭제 후 rename 순서.

BEGIN;

-- 1. 새로 auto-create된 빈 our_side/opposing_side 중, 같은 case에 옛날 레코드도 있는 경우 — 새 빈 레코드 제거
DELETE FROM public.case_counterparties a
USING public.case_counterparties b
WHERE a.case_id = b.case_id
  AND (
    (a.role = 'our_side' AND b.role = 'client_self') OR
    (a.role = 'opposing_side' AND b.role = 'spouse')
  )
  AND (a.profile IS NULL OR a.profile = '{}'::jsonb);

-- 2. 옛날 role 값을 새 role로 rename (데이터 유지)
UPDATE public.case_counterparties SET role = 'our_side' WHERE role = 'client_self';
UPDATE public.case_counterparties SET role = 'opposing_side' WHERE role = 'spouse';

-- 3. 옛 'client' role (사용 안 되는 placeholder) 제거
DELETE FROM public.case_counterparties WHERE role = 'client';

COMMIT;

NOTIFY pgrst, 'reload schema';
