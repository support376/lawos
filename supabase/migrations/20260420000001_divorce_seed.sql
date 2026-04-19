-- 이혼 도메인 시드 (v0.3 확장성 증명)
-- Stage 10개 + 전이 + 서류 + 리스크
-- 코드 변경 없이 시드만으로 이혼 파이프라인 동작 가능하게.

BEGIN;

-- Stage 정의
INSERT INTO public.stage_definitions (domain, key, label, order_index, phase, primary_role, typical_duration_days, is_bypass, description) VALUES
  ('divorce','consultation','상담',1,'pre_filing','attorney',3,false,'초기 상담 · 경로 추천 · 수임 여부 판단'),
  ('divorce','engagement','수임',2,'pre_filing','attorney',7,false,'위임계약 · 수임료 · 진행 방식 결정'),
  ('divorce','evidence_gathering','증거수집',3,'pre_filing','document_staff',30,false,'유책사유 · 재산 · 양육환경 · 가족관계 증빙 수집'),
  ('divorce','mediation_attempt','조정 시도',4,'filing_review','attorney',45,false,'가소법 §50 조정전치. 합의 도출 시 본안 회피'),
  ('divorce','filing_main','본안 접수',5,'filing_review','attorney',7,false,'이혼소송 소장 접수'),
  ('divorce','discovery','사실조회',6,'post_opening','attorney',30,false,'재산조회·금융조회·양육환경조사 등'),
  ('divorce','hearing','변론·심리',7,'post_opening','attorney',90,false,'변론기일·증인심문·준비서면 공방'),
  ('divorce','judgment','판결',8,'closing','court',30,false,'이혼판결·재산분할·친권·양육비 결정'),
  ('divorce','appeal','항소',9,'closing','attorney',120,true,'불복 시 항소 (우회 경로)'),
  ('divorce','enforcement','집행',10,'closing','attorney',60,false,'재산분할 집행·양육비 이행 확보')
ON CONFLICT (domain, key) DO NOTHING;

-- 전이 정의 (정상 경로 + 항소 우회)
INSERT INTO public.stage_transitions_def (domain, from_stage, to_stage, condition, is_bypass) VALUES
  ('divorce','consultation','engagement','수임 결정',false),
  ('divorce','engagement','evidence_gathering','수임계약 체결',false),
  ('divorce','evidence_gathering','mediation_attempt','증거 일부 수집 후 조정 시도',false),
  ('divorce','evidence_gathering','filing_main','조정 생략·긴급 시 본안 직접',false),
  ('divorce','mediation_attempt','enforcement','조정 성립 · 종결',false),
  ('divorce','mediation_attempt','filing_main','조정 불성립 → 본안',false),
  ('divorce','filing_main','discovery','소장 접수 후 사실조회',false),
  ('divorce','discovery','hearing','조회 결과 기반 변론 준비',false),
  ('divorce','hearing','judgment','변론 종결 · 판결 선고',false),
  ('divorce','judgment','enforcement','판결 확정 · 집행',false),
  ('divorce','judgment','appeal','불복 · 항소',true),
  ('divorce','appeal','hearing','환송 시 재심리',true),
  ('divorce','appeal','judgment','항소심 판결',true),
  ('divorce','appeal','enforcement','확정 후 집행',true)
ON CONFLICT (domain, from_stage, to_stage) DO NOTHING;

-- 서류 정의
INSERT INTO public.document_type_definitions (domain, key, label, required, source, category, used_in_stages) VALUES
  ('divorce','marriage_cert','혼인관계증명서',true,'public_record','identity',ARRAY['evidence_gathering','filing_main']),
  ('divorce','family_cert','가족관계증명서',true,'public_record','identity',ARRAY['evidence_gathering','filing_main']),
  ('divorce','basic_cert','기본증명서',true,'public_record','identity',ARRAY['evidence_gathering','filing_main']),
  ('divorce','resident_reg','주민등록등본',true,'public_record','identity',ARRAY['evidence_gathering','filing_main']),
  ('divorce','income_proof','소득금액증명',true,'client','financial',ARRAY['evidence_gathering','discovery']),
  ('divorce','property_register','부동산등기부',false,'public_record','asset',ARRAY['evidence_gathering','discovery']),
  ('divorce','bank_statement_12m','통장내역 12개월',false,'client','financial',ARRAY['evidence_gathering','discovery']),
  ('divorce','insurance_policy','보험가입증명',false,'client','asset',ARRAY['discovery']),
  ('divorce','school_records','자녀 학교 기록',false,'client','custody',ARRAY['evidence_gathering','discovery']),
  ('divorce','medical_report','진단서·치료기록',false,'client','fault',ARRAY['evidence_gathering']),
  ('divorce','violence_photos','폭행·증거 사진',false,'client','fault',ARRAY['evidence_gathering']),
  ('divorce','messaging_evidence','카톡·문자 증거',false,'client','fault',ARRAY['evidence_gathering']),
  ('divorce','call_records','통화기록',false,'client','fault',ARRAY['evidence_gathering']),
  ('divorce','affair_evidence','부정행위 증거',false,'client','fault',ARRAY['evidence_gathering','hearing']),
  ('divorce','complaint_draft','이혼소장 초안',true,'client','filing',ARRAY['filing_main']),
  ('divorce','prep_brief','준비서면',false,'client','filing',ARRAY['hearing'])
ON CONFLICT (domain, key) DO NOTHING;

-- 리스크 정의 (민법 §840 유책사유 + 실무 위험)
INSERT INTO public.risk_flag_definitions (domain, key, label, level, description, response, activates_actions) VALUES
  ('divorce','infidelity_evidence','부정행위 증거','red','민법 §840 1호 · 상간자 별소 가능','부정행위 증거 확보 + 상간자 신원 파악',ARRAY[]::TEXT[]),
  ('divorce','domestic_violence','가정폭력','red','민법 §840 3호 · 가폭방지법','접근금지 가처분 선제 · 진단서·112 신고기록 확보',ARRAY[]::TEXT[]),
  ('divorce','child_abuse_suspected','아동학대·방임 의심','red','아동복지법 §17','임시양육자 지정 사전처분 + 친권 단독 주장',ARRAY[]::TEXT[]),
  ('divorce','hidden_assets_suspected','재산 은닉 의심','red','분할 대상 축소 위험','가압류·처분금지 보전 선제 조치',ARRAY[]::TEXT[]),
  ('divorce','marriage_fraud','혼인 사기·강박·중혼 정황','red','민법 §815~§825 혼인무효·취소','이혼이 아닌 혼인 자체 무효·취소 검토',ARRAY[]::TEXT[]),
  ('divorce','in_law_abuse','인척 학대','yellow','민법 §840 3·4호','학대 증언·기록 수집',ARRAY[]::TEXT[]),
  ('divorce','economic_abandonment','경제적 유기','yellow','민법 §840 2호','경제활동 중단·부양 회피 증빙',ARRAY[]::TEXT[]),
  ('divorce','sex_refusal','성관계 거부','yellow','민법 §840 6호','장기 거부 입증 · 파탄주의 근거',ARRAY[]::TEXT[]),
  ('divorce','religious_imposition','종교 강요','yellow','민법 §840 6호','강요 패턴 기록',ARRAY[]::TEXT[]),
  ('divorce','drug_abuse','약물 남용','red','친권·양육권 판단 영향','치료기록·증언 확보',ARRAY[]::TEXT[]),
  ('divorce','gambling_addiction','도박 중독','yellow','재산탕진·양육부적격','변제기록·치료 참여 확인',ARRAY[]::TEXT[]),
  ('divorce','foreign_spouse','외국인 배우자','yellow','국제사법 §39 · 준거법 이슈','국적·거소지 법 검토',ARRAY[]::TEXT[])
ON CONFLICT (domain, key) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
