# LawOS V0 개발 기획서

작성일: 2026-05-05
대상: dogfood 1호 — Welcome 법률사무소 (양변호사 + 마케터 김씨)
빌드 기간: 4주

---

## 1. 제품 한 줄

**변호사 사무실의 마케팅·인입·콘텐츠 운영을 한 화면에서 점검하고, 필요할 때 AI 사무장에게 시간제로 위임하는 로펌 운영 OS.**

핵심 차별점은 "사이트 빌더가 아니라 사이트 위에서 운영되는 OS 레이어".

---

## 2. 타깃과 페인

별산제 변호사 사무실 (1~5인). 마케팅 예산 월 100~500만 운영. 카톡방 1년치 분석에서 도출된 페인:

1. 네이버 검색 로직 변경 (블로그 통검 노출 붕괴)
2. ChatGPT 5.4 트래픽 1/3 토막 (GEO 검색 경쟁)
3. 변협 광고규정 시행 (파워링크 키워드 대량 반려)
4. 잡콜 90%+ — 진성콜 분리 안 됨
5. 광고비 4천만 쓰고 수임 0건 — ROI 추적 안 됨
6. 대행사 양아치 (도메인·계정 권한 미반환)
7. 매주 회의 위한 회의 — 자동 리포트 부재
8. 블로그 영정·저품 공포

---

## 3. 3층 구조 — L1·L2·L3

| 층 | 시점 | 메커니즘 | DB 의존 | KPI |
|---|---|---|---|---|
| L1 즉각 밸류 | Day 0 (비로그인 가능) | 외부 API 1회 호출 | 0 | 비가입→가입 전환율 |
| L2 락인 | Day 1~30 누적 | 시간 누적 자산 | 점진 | D7·D30 리텐션 |
| L3 수익 | Day 7+ | 활성화 게이트 | 사용량 측정 | 무료→유료 전환율 |

핵심 원칙: **무료 = 시스템 비용 0인 조회·진단·작성. 유료 활성화 = 발행·자동화·외부 연결·사무장 가동.**

V0에서는 결제 없이 "활성화 신청" → 이메일/카톡으로 1:1 견적 수신.

---

## 4. V0 기능 셋

### L1 즉각 밸류 (4종)
1. 사이트 URL → SEO·EEAT 즉시 진단
2. 광고 카피 텍스트 → 변협 §31·§34 검증
3. 트렌드 토픽 TOP 10 (RSS·구글 트렌드)
4. AI 글 골격 1회 생성 (Claude API)

### L2 락인 (4종)
5. 채널 헬스 히스토리 (5채널 등록)
6. 키워드 순위 추적 (5개 무료, 30개 유료)
7. 콘텐츠 라이브러리 (작성·발행 누적)
8. OAuth 연결 (GSC·네이버블로그)

### L3 활성화 게이트 (V0 placeholder, 결제 X)
- 콘텐츠 외부 발행
- 자동 키워드 추적 (매일)
- 사무장 가동 (콜·인테이크·작가)
- 광고 발신 자동 차단·교정
- 인입 inbox 통합

### Agent 라인업 (V0)

| 사무장 | 모드 | 가격 | 백엔드 |
|---|---|---|---|
| 콜 사무장 김도우미 | On-Demand (캘린더) | 시간 5천 / 월 9.9만 | ElevenLabs + Twilio |
| 인테이크봇 박매니저 | Always-On | 셋업 19만 + 건당 1천 | Claude API |
| 콘텐츠 작가 이작가 | On-Demand | 건당 5~30만 / 월 49만 | Claude + 자체 RAG |
| 광고규제 검증 최감독 | Always-On | 무료 (Pro 포함) | Claude + 변협 룰북 |
| GEO 인용 추적 정탐색 | Always-On | 무료 (Pro 포함) | 자체 쿼리 |
| Follow-up 한매니저 | Always-On | 무료 (Studio) | 자체 시퀀스 |

---

## 5. 데이터 모델 — 신규 6개 테이블

기존 LawOS 인프라(workspaces, users, workspace_members, kanban_boards, kanban_columns, tickets, ticket_activities, events, attachments)는 그대로 유지.

V0 신규:

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  status TEXT DEFAULT 'ok',
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  rank INTEGER,
  measured_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE content_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT,
  status TEXT DEFAULT 'idea',
  body TEXT,
  ai_ratio NUMERIC(3,2),
  ad_check_status TEXT,
  channel_id UUID REFERENCES channels(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE ad_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  status TEXT DEFAULT 'requested',
  requested_at TIMESTAMPTZ DEFAULT now(),
  activated_at TIMESTAMPTZ
);
```

전부 RLS workspace_id 정책 적용. 기존 패턴 그대로.

---

## 6. 기존 LawOS 자산 처리

| 자산 | 처리 |
|---|---|
| Supabase + RLS multi-tenancy | ✓ 살림 |
| 가입 자동 provisioning 트리거 | ✓ 살림. 워크스페이스 생성 시 채널 슬롯 5개 자동 |
| 칸반 코어 + dnd-kit | ✓ 살림. content_pieces 큐로 재정의 |
| ticket_activities 감사 로그 | ✓ 살림. 변협 신고 대응 증빙 |
| ai_suggested + ai_reasoning | ✓ 살림. AI hedge UX 베이스 |
| consultation_logs | ✓ 살림. 인테이크 사무장 학습 데이터 |
| events 테이블 | ✓ 살림. 인입 inbox 백본 |
| AppHeader, CommandPalette, UserMenu | ✓ 살림 |
| 4파이프라인 (Consultant/Billing/Writer/Partner) | ✗ 메인 네비에서 제거. 코드는 dead code |
| Workbench 페이지 | ✗ 메인 네비에서 제거 |
| personal_rehab 온톨로지 | △ "개인회생 모델 패키지" 1종으로 압축 |
| universal_layer v03 | △ 모델 패키지 추상화 골격으로 일부 |
| finance_hold·payment·case_approval | ✗ 동결 |
| divorce_seed·counterparty | △ 모델 마켓 V2에서 부활 가능 |

---

## 7. Agent 인프라 외부 의존

| 인프라 | 용도 | 비용 |
|---|---|---|
| Anthropic Claude API | 인테이크봇·작가·광고규제·골격 | 변동 (사용량 한도) |
| ElevenLabs Conversational AI | 콜 사무장 음성 | 분당 ~150원 |
| Twilio | 070 회선·녹취·STT | 회선 + 분당 |
| 토스페이먼츠 | 결제 (V1 이상) | 거래액 % |
| 알리고 / NHN Toast | 알림톡 | 건당 9~30원 |

V0 의존 인프라는 Claude API 1개만. 나머지는 V1+에서 통합.

---

## 8. 가격 (V0 placeholder, 결제 X)

| 라인 | 가격 | 잠금 해제 |
|---|---|---|
| Free | 0 | 사이트 1, 키워드 5, 콘텐츠 5건/월, AI 어투 학습 X |
| Pro | 월 9.9만 | 사이트 3, 키워드 30, 콘텐츠 30건, 광고규제 검증 자동 |
| Studio | 월 29.9만 | 무제한 + 채널 inbox + Follow-up 자동 |
| 콜 사무장 | 월 9.9만 / 시간 5천 | 음성 응대 |
| 인테이크봇 | 셋업 19만 + 건당 1천 | 챗 응대 |
| 콘텐츠 작가 | 건당 5~30만 / 월 49만 | 글 작성 위임 |

V0에서 "활성화 신청" → 이메일/카톡 알림 → 1:1 견적 수신.

---

## 9. 화면 5개

1. 랜딩 (비로그인) — L1 즉각 진단 hero
2. 온보딩 (가입 직후) — 채널·키워드 등록 3단계
3. 메인 대시보드 — KPI·알림·트렌드·채널·콘텐츠 큐·사무장·액션 큐
4. 사무장 카탈로그 — 6장 카드 + 활성화 신청
5. 콘텐츠 작성 — Surfer 스타일 사이드패널 (SEO·AI hedge·변협 검증)

V0 베타 빌드: 우선 화면 3 (대시보드) 완성 → 1·5 → 2·4

---

## 10. 빌드 마일스톤 (4주)

- W1: 랜딩 + L1 4개 작동 (사이트 진단·변협 검증·트렌드·골격) + 가입
- W2: 온보딩 + 채널/키워드 등록 + 메인 대시보드 KPI 위젯
- W3: 콘텐츠 작성 화면 + AI hedge + 광고규제 자동 검증
- W4: 사무장 카탈로그 + 활성화 신청 흐름 + Welcome 법률사무소 dogfood

---

## 11. 수락 기준 (V0 종료)

1. Welcome 법률사무소 변호사 1인 + 마케터 1인 매주 월요일 켬
2. L1 4개 작동 (외부 API 1회 호출 결과 노출)
3. 채널 5개·키워드 5개 등록 후 KPI 위젯 작동
4. 콘텐츠 1편 작성 → AI hedge → 변협 검증 → 발행 신청
5. 사무장 1종 활성화 신청 발생 (이메일·카톡 수신 확인)
6. 6명 평가 agent 모두 95점 이상 (UI 평가 루프)

---

## 12. 리스크

1. ElevenLabs 한국어 통화 품질 — V1 전 1주 검증 필요
2. 회색지대 사무장(카페·지식인) 변협 신고 위험 — 변호사 검수 강제
3. 블로그 분석 정확도 (네이버 API 차단) — 블덱스 등 제휴 협상
4. 마케터 vs 변호사 카니발리제이션 — 역할 분리 UX
5. L1 너무 강하면 가입 전환 X — 결과 휘발 정책 (1시간 후 사라짐)

---

## 13. 다음 단계

이 기획서 + 와이어프레임(lawos_v0_dashboard.html)을 6명 평가 agent로 반복 평가 → 95점 이상 도달 시 W1 빌드 시작.
