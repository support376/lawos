-- 대공사 리셋: 칸반·워크플로우·온톨로지 기존 구현 전체 제거.
-- 도메인별 워크플로우를 처음부터 다시 설계하기 위한 백지화.
-- 의뢰인·사건·첨부·이벤트·팀은 보존.

BEGIN;

-- 1. 칸반 관련 테이블 전체 삭제
DROP TABLE IF EXISTS public.ticket_activities CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.kanban_columns CASCADE;
DROP TABLE IF EXISTS public.kanban_boards CASCADE;

-- 2. 구 워크플로우·전략 관련 테이블 제거
DROP TABLE IF EXISTS public.case_tactics_adopted CASCADE;
DROP TABLE IF EXISTS public.case_counterparties CASCADE;

-- 3. cases 테이블에서 구 워크플로우 컬럼 제거
ALTER TABLE public.cases
  DROP COLUMN IF EXISTS workflow_stage,
  DROP COLUMN IF EXISTS workflow_docs,
  DROP COLUMN IF EXISTS workflow_history,
  DROP COLUMN IF EXISTS case_intel;

-- 4. clients 테이블에서 개인회생 편향 재무·위험 컬럼 제거 (사람 자체만 남김)
ALTER TABLE public.clients
  DROP COLUMN IF EXISTS monthly_income_krw,
  DROP COLUMN IF EXISTS total_debt_krw,
  DROP COLUMN IF EXISTS dependents_count,
  DROP COLUMN IF EXISTS occupation,
  DROP COLUMN IF EXISTS assets,
  DROP COLUMN IF EXISTS risk_flags,
  DROP COLUMN IF EXISTS intel_updated_at;

-- 5. attachments에서 ticket_id 컬럼 제거 (tickets 테이블 없음)
ALTER TABLE public.attachments DROP COLUMN IF EXISTS ticket_id;

-- 6. 클라이언트 포털 토큰 테이블 (있을 경우) 제거
DROP TABLE IF EXISTS public.portal_tokens CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
