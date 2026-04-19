-- 온톨로지 v0.3.1 — 도메인 × 역할 권한 매트릭스
-- 원칙: 모든 역할이 특정 도메인에 귀속. domain='*'는 전 도메인 센티넬.
-- 예: (개인회생, 상담원) vs (이혼, 상담원) 별도 권한.

BEGIN;

-- =========================================================================
-- 1. workspace_member_roles 재구성
-- =========================================================================

-- 기존 PK 제거 후 domain 컬럼 추가
ALTER TABLE public.workspace_member_roles
  DROP CONSTRAINT IF EXISTS workspace_member_roles_pkey;

ALTER TABLE public.workspace_member_roles
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '*'
    CHECK (domain = '*' OR domain IN ('personal_rehab','divorce','criminal','other'));

ALTER TABLE public.workspace_member_roles
  ADD CONSTRAINT workspace_member_roles_pkey
  PRIMARY KEY (workspace_id, user_id, domain, role);

-- 권한 헬퍼: 도메인 × 역할 체크
CREATE OR REPLACE FUNCTION public.has_role_in_domain(ws UUID, d TEXT, r TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_member_roles
    WHERE workspace_id = ws
      AND user_id = auth.uid()
      AND role = r
      AND (domain = d OR domain = '*')
  )
$$;

-- 기존 has_role은 도메인 무관 체크로 유지 (backward compat)
-- = 모든 도메인에 걸쳐서 그 역할을 하나라도 가졌는지
CREATE OR REPLACE FUNCTION public.has_role(ws UUID, r TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_member_roles
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = r
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(ws UUID, roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_member_roles
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = ANY(roles)
  )
$$;

-- =========================================================================
-- 2. case_team_assignments에도 domain 명시화는 불필요
--    (cases.case_type으로 도메인 추출 가능)
-- =========================================================================

-- =========================================================================
-- 3. leads.case_type_hint 제약 강화 (NOT NULL + undetermined 허용)
-- =========================================================================

-- 기존 NULL 값 업데이트
UPDATE public.leads SET case_type_hint = 'undetermined' WHERE case_type_hint IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN case_type_hint SET DEFAULT 'undetermined';

ALTER TABLE public.leads
  ALTER COLUMN case_type_hint SET NOT NULL;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_case_type_hint_check
  CHECK (case_type_hint IN ('undetermined','personal_rehab','divorce','criminal','other'));

CREATE INDEX IF NOT EXISTS idx_leads_domain_status
  ON public.leads(workspace_id, case_type_hint, status);

-- =========================================================================
-- 4. Stage/Document/RiskFlag 시드 (개인회생 v0.2)
-- =========================================================================

-- 4a. stage_definitions 시드
INSERT INTO public.stage_definitions (domain, key, label, order_index, phase, primary_role, typical_duration_days, is_bypass, description) VALUES
  ('personal_rehab','consultation','상담',1,'pre_filing','attorney',3,false,'유사 사례 조회, 의뢰인 초기 진단'),
  ('personal_rehab','engagement','수임',2,'pre_filing','attorney',7,false,'위임계약 · 수임료 · 추심 제한 효과 고지'),
  ('personal_rehab','document_prep','서류준비',3,'pre_filing','document_staff',30,false,'채무자↔대리인 반복 소통. 증빙 수집 완성도가 보정 빈도 좌우.'),
  ('personal_rehab','filing','신청접수',4,'filing_review','attorney',3,false,'인지대·송달료 납부. 중지·금지명령 병행 가능.'),
  ('personal_rehab','correction_loop','보정 루프',5,'filing_review','correction_staff',21,false,'법원↔대리인. 1차는 서류 보완, 2·3차로 갈수록 실체적 쟁점.'),
  ('personal_rehab','dismissal','기각',6,'filing_review','court',NULL,true,'법원 실수 또는 보정 과정에서의 마찰로 간혹 발생 (v0.2 신규)'),
  ('personal_rehab','immediate_appeal','즉시항고',7,'filing_review','correction_staff',14,true,'기각 결정에 대한 항고. 판례 근거 중요. (v0.2 신규)'),
  ('personal_rehab','dismissal_revoked','기각취소',8,'filing_review','court',NULL,true,'상급심의 취소 결정 후 개시결정으로 복귀 (v0.2 신규)'),
  ('personal_rehab','opening_decision','개시결정',9,'post_opening','court',14,false,'결정 송달 수령. 채권자에 대한 추심 본격 금지.'),
  ('personal_rehab','claim_filing','채권신고·조사',10,'post_opening','creditor',30,false,'채권자↔법원 신고. 대리인이 이의 대응.'),
  ('personal_rehab','creditor_meeting','채권자집회',11,'post_opening','trustee',1,false,'이의 대응 논리에 판례 필요.'),
  ('personal_rehab','plan_approval','변제계획 인가',12,'post_opening','court',30,false,'인가 요건 해석에 판례 활용.'),
  ('personal_rehab','repayment','변제수행',13,'repayment','trustee',NULL,false,'회생위원↔채무자 월 단위 소통. 변경 시 판례 근거 필요.'),
  ('personal_rehab','modification','계획 변경',14,'repayment','attorney',30,false,'소득변동 등으로 변제계획 변경 필요'),
  ('personal_rehab','discharge','면책',15,'closing','court',14,false,'면책 결정 통지. 종결.'),
  ('personal_rehab','termination','폐지',16,'closing','court',NULL,false,'변제 실패 시. 폐지 방어 논리에 판례 필수.')
ON CONFLICT (domain, key) DO NOTHING;

-- 4b. stage_transitions_def 시드 (정상경로 + 기각 우회)
INSERT INTO public.stage_transitions_def (domain, from_stage, to_stage, condition, is_bypass) VALUES
  ('personal_rehab','consultation','engagement','수임 결정',false),
  ('personal_rehab','engagement','document_prep','수임계약 체결',false),
  ('personal_rehab','document_prep','filing','필수 서류 수집 완료',false),
  ('personal_rehab','filing','correction_loop','법원 보정 권고',false),
  ('personal_rehab','filing','opening_decision','보정 없이 개시',false),
  ('personal_rehab','correction_loop','correction_loop','다음 회차 보정',false),
  ('personal_rehab','correction_loop','opening_decision','보정 완료 후 개시',false),
  ('personal_rehab','correction_loop','dismissal','보정 실패·법원 기각',true),
  ('personal_rehab','filing','dismissal','즉시 기각',true),
  ('personal_rehab','dismissal','immediate_appeal','항고 결정',true),
  ('personal_rehab','immediate_appeal','dismissal_revoked','상급심 취소',true),
  ('personal_rehab','dismissal_revoked','opening_decision','개시결정으로 복귀',true),
  ('personal_rehab','opening_decision','claim_filing','개시결정 송달 완료',false),
  ('personal_rehab','claim_filing','creditor_meeting','신고기간 종료',false),
  ('personal_rehab','creditor_meeting','plan_approval','집회 후 인가 심리',false),
  ('personal_rehab','plan_approval','repayment','인가결정 확정',false),
  ('personal_rehab','repayment','modification','소득변동·변경사유',false),
  ('personal_rehab','modification','repayment','변경 인가',false),
  ('personal_rehab','repayment','termination','변제 실패 3개월 이상',false),
  ('personal_rehab','repayment','discharge','변제 완료 (24/36/60개월)',false)
ON CONFLICT (domain, from_stage, to_stage) DO NOTHING;

-- 4c. document_type_definitions 시드 (개인회생 주요 서류)
INSERT INTO public.document_type_definitions (domain, key, label, required, source, category, used_in_stages) VALUES
  ('personal_rehab','petition','개인회생 신청서',true,'client','application',ARRAY['filing']),
  ('personal_rehab','creditor_list','채권자목록',true,'client','application',ARRAY['document_prep','filing']),
  ('personal_rehab','property_list','재산목록',true,'client','application',ARRAY['document_prep','filing']),
  ('personal_rehab','income_expense_list','수입지출목록',true,'client','application',ARRAY['document_prep','filing']),
  ('personal_rehab','statement','진술서',true,'client','application',ARRAY['filing']),
  ('personal_rehab','resident_reg','주민등록등본',true,'public_record','identity',ARRAY['document_prep']),
  ('personal_rehab','family_cert','가족관계증명서',true,'public_record','identity',ARRAY['document_prep']),
  ('personal_rehab','income_proof_payroll','근로소득 원천징수영수증',false,'client','income',ARRAY['document_prep']),
  ('personal_rehab','income_proof_business','사업소득증빙',false,'client','income',ARRAY['document_prep']),
  ('personal_rehab','bank_statement','통장내역 6개월',true,'client','income',ARRAY['document_prep']),
  ('personal_rehab','property_register','부동산등기부등본',false,'public_record','asset',ARRAY['document_prep']),
  ('personal_rehab','vehicle_register','차량등록원부',false,'public_record','asset',ARRAY['document_prep']),
  ('personal_rehab','insurance_policy','보험증권',false,'client','asset',ARRAY['document_prep']),
  ('personal_rehab','debt_cert','부채증명원',true,'client','debt',ARRAY['document_prep']),
  ('personal_rehab','lawsuit_record','소장·판결문',false,'client','debt',ARRAY['document_prep']),
  ('personal_rehab','dunning_notice','독촉장',false,'client','debt',ARRAY['document_prep'])
ON CONFLICT (domain, key) DO NOTHING;

-- 4d. risk_flag_definitions 시드 (v0.2 7개)
INSERT INTO public.risk_flag_definitions (domain, key, label, level, description, response, activates_actions) VALUES
  ('personal_rehab','recent_loan_within_3m','최근 3개월 내 대출 발생','red','사기죄 고소 위험','대출 목적·채무 규모·변제 의사 시점 면밀 검토',ARRAY['draft_petition']),
  ('personal_rehab','preferential_transfer_risk','편파변제 있음','yellow','부인권 대상 가능','부인권 대상 검토 및 전략 조정',ARRAY['analyze_preferential']),
  ('personal_rehab','fraudulent_transfer_risk','최근 재산 처분','yellow','사해행위 성립 여부','사해행위 성립 여부 검토',ARRAY['analyze_preferential']),
  ('personal_rehab','has_guarantor','보증인 존재','yellow','연대채무 유지 · 보증인 영향','연대채무 유지 고지 · 보증인 대응 전략 수립',ARRAY[]::TEXT[]),
  ('personal_rehab','has_prior_discharge_within_5y','면책 후 5년 이내 재신청','red','재신청 제한 (v0.2: 7년→5년)','파산면책 검토 등 대안',ARRAY[]::TEXT[]),
  ('personal_rehab','has_tax_arrears','국세 체납','yellow','우선변제 채권','별도 변제 계획 필요',ARRAY[]::TEXT[]),
  ('personal_rehab','has_insurance_arrears','4대보험 체납','yellow','우선변제 채권','별도 변제 계획 필요',ARRAY[]::TEXT[]),
  ('personal_rehab','has_criminal_case','형사사건 진행 중','red','우선변제 채권 (실질 리스크)','형사 채권자는 실질 리스크. 절차 영향 큼.',ARRAY[]::TEXT[])
ON CONFLICT (domain, key) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
