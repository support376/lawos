-- 이혼 도메인 Actor 역할 리네이밍 (v0.3 → v0.4)
-- client_self → our_side, spouse → opposing_side
-- 개념: 의뢰인이 부부 당사자라는 고정 가정 제거, 우리측/상대방측 대칭 프레임.

UPDATE public.case_counterparties
SET role = 'our_side'
WHERE role = 'client_self';

UPDATE public.case_counterparties
SET role = 'opposing_side'
WHERE role = 'spouse';

NOTIFY pgrst, 'reload schema';
