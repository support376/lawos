# 로펌 업무 온톨로지 v0.3

**발신** Circle21 · 웰컴법률사무소
**범위** v0.2 확장 — Lead · Communication · Payment · Action · Role 범용 레이어 + 역할별 View 구조
**목적** 수임 전(Lead)·사건(Case)·결제(Payment)까지 단일 온톨로지. 역할별 대시보드를 시드 데이터로 조립. 도메인 추가 비용을 테이블 복제에서 시드 추가로 축소.
**상위 버전** `personal_rehab_ontology_v0.2` (개인회생 13 엔티티) — v0.3에서 그대로 포섭

---

## 1. v0.2의 한계 (진단)

v0.2는 개인회생 "사건 진행 중" 모델에 충실. 그러나 실무 업무는 Case 바깥에 더 많음:

- 상담원이 리드 유치·상담 대화 기록 → 현재 모델에 없음
- 수임 이후의 서류·보정 → 현재 모델에 있음 (v0.2)
- 착수금·중도금·성공보수·미수금 독촉 → 현재 모델에 없음
- 역할별(상담원·서류팀·결제팀·변호사·대표)로 봐야 할 **기본 뷰**가 코드에 하드코딩됨 → 확장 비용
- Stage·서류 정의가 TypeScript enum → 도메인·법원 변형 대응 불가

→ **"Case 중심 단일축"에서 "Object-Action-View 3레이어"로 승격**.

---

## 2. v0.3 설계 원칙

### 2.1 3레이어 분리

```
┌─────────────────────────────────────────────┐
│  OBJECT    영속 데이터. 행동 없음.             │
│            Lead · Case · Client · Payment    │
│            Communication · Action · (도메인)   │
├─────────────────────────────────────────────┤
│  ACTION    객체에 가해지는 writes.            │
│            단일 Registry에서 선언.            │
├─────────────────────────────────────────────┤
│  VIEW      역할별 대시보드. 시드 데이터로 조립. │
└─────────────────────────────────────────────┘
```

### 2.2 확장 가능한 지도의 4조건

| 조건 | 구현 방식 |
|---|---|
| 엔티티 = 순수 데이터 | 테이블. 행동은 Action만이 유일한 writes 경로 |
| Action = Registry | `ACTION_REGISTRY` 선언 테이블 + TS 레지스트리 모듈. 새 Action = row 추가 |
| Stage·Doc·Risk = 시드 | `stage_definitions`·`document_types`·`risk_flag_defs` 테이블. TypeScript enum 제거 |
| View = 선언적 | `dashboard_configs` 테이블. 범용 렌더러 한 개 |

### 2.3 도메인 확장 비용

- v0.2: 새 도메인 = 13개 `{domain}_*` 테이블 복제 + 코드 전체 확장
- v0.3: 새 도메인 = 온톨로지 시드 행 추가 + 도메인 전용 계산 모듈 (`domains/{key}/calculations.ts` 류)

---

## 3. v0.3 신규 범용 엔티티 (5)

### 3.1 Lead (수임 전)

수임계약 체결 **이전**의 잠재 의뢰인. 상담원이 소유.

| 필드 | 설명 |
|---|---|
| `id`, `workspace_id` | 기본 |
| `name`, `contact`, `contact_secondary` | 연락처 |
| `source` | 유입 채널 (`phone` / `kakao_ads` / `blog` / `referral` / `walk_in` / `other`) |
| `assigned_consultant_id` | 담당 상담원 (workspace_members FK) |
| `status` | `new` / `contacted` / `qualified` / `converted` / `lost` / `cold` |
| `case_type_hint` | `personal_rehab` / `divorce` / ... (미확정 가능) |
| `first_contact_at`, `last_contact_at` | 타임스탬프 |
| `lost_reason` | 이탈 사유 (`fee_mismatch` / `competitor` / `cooled_off` / `ineligible` / `other`) |
| `converted_at`, `case_id` | 수임 확정 시점·연결된 Case |
| `notes` | 자유 메모 |
| `triage_score` | 0~100 자동 스코어 (향후) |
| `urgency` | `high` / `normal` / `low` |

**수임 전환 시**: `status=converted` + `case_id` 채움 + `converted_at` 기록. Lead는 삭제 안 함 (전환율 계산용).

---

### 3.2 Communication (통합 접촉 로그)

Lead·Client·Case 어디에나 붙는 **다형 로그**.

| 필드 | 설명 |
|---|---|
| `id`, `workspace_id` | 기본 |
| `subject_type` | `lead` / `client` / `case` |
| `subject_id` | UUID (각 테이블 참조) |
| `channel` | `call` / `kakao` / `sms` / `email` / `visit` / `letter` |
| `direction` | `inbound` / `outbound` |
| `occurred_at` | 접촉 시각 |
| `summary` | 한 줄 요약 |
| `content` | 본문 (카톡 전체·메일 본문 등) |
| `duration_seconds` | 통화·방문 시간 |
| `attachment_ids[]` | 첨부 연결 |
| `logged_by_user_id` | 기록자 |
| `auto_captured` | 자동 인입(AI 분석 등) 여부 |
| `sentiment` | `positive` / `neutral` / `negative` / `urgent` (AI 태깅, 향후) |

**왜 다형**: 상담 대화는 Lead에, 수임 후 통화는 Case에, 고객 생애주기는 Client에 붙어야 자연스러움. 같은 테이블에서 `subject_*`로 귀속 관리.

---

### 3.3 Payment (결제)

Case 1개에 N개의 결제 건. 착수금·중도금·성공보수·분납.

| 필드 | 설명 |
|---|---|
| `id`, `workspace_id`, `case_id` | 기본 |
| `kind` | `retainer`(착수금) / `installment`(중도금) / `success_fee`(성공보수) / `court_fee`(법원비용) / `misc` |
| `amount_krw` | 계약 금액 |
| `paid_amount_krw` | 누적 수령액 |
| `due_date` | 지급 예정일 |
| `paid_date` | 실제 지급일 (부분지급 시 최종) |
| `status` | `scheduled` / `partial` / `paid` / `overdue` / `waived` / `refunded` |
| `dunning_count` | 독촉 발송 횟수 |
| `last_dunning_at` | 최근 독촉 시각 |
| `payment_method` | `bank_transfer` / `card` / `cash` / `check` |
| `invoice_issued` | 세금계산서 발행 여부 |
| `notes` | |

**상태 전이**: `scheduled → partial → paid` 또는 `scheduled → overdue`(due_date 지남). `overdue` 진입 시 Action 자동 생성 (`send_dunning`).

---

### 3.4 Action (업무 실행 단위)

**모든 객체 위에 가해지는 일**을 표현하는 단일 엔티티. tickets가 하던 일을 온톨로지 1급 개념으로 승격.

| 필드 | 설명 |
|---|---|
| `id`, `workspace_id` | 기본 |
| `subject_type` | `lead` / `case` / `client` / `payment` |
| `subject_id` | UUID |
| `action_type` | `ACTION_REGISTRY` 키 (예: `send_dunning`, `log_consultation`, `advance_stage`) |
| `title` | 사람이 읽는 제목 |
| `assigned_to` | 담당 user_id |
| `team_role` | 담당 팀 (role 중 하나) |
| `due_date` | 마감 |
| `status` | `pending` / `doing` / `blocked` / `done` / `cancelled` |
| `priority` | 1~4 |
| `payload` | JSONB (action_type마다 다름) |
| `created_by`, `completed_by`, `completed_at` | 감사 |
| `parent_action_id` | 서브태스크용 (선택) |
| `auto_generated` | 시스템 자동생성 여부 |
| `blocking_reason` | `blocked` 사유 |

**Stage와의 관계**: Stage는 Case가 속한 상태. Action은 그 Stage에서 해야 할 구체 행동. Stage 전이도 한 종류의 Action (`advance_stage`).

---

### 3.5 Role (사용자 역할)

`workspace_members` 확장. 한 사용자는 워크스페이스당 1~N개 역할.

**초기 역할 세트 (8)**:

| key | 라벨 | 기본 관심 범위 |
|---|---|---|
| `managing_partner` | 대표변호사 | 전사 조망 · 모든 Action 접근 |
| `attorney` | 변호사 | 할당된 Case · Stage 책임 |
| `consultant` | 상담원 | 자신이 담당한 Lead · 전환 목표 |
| `document_staff` | 서류팀 | 서류준비·수집 Stage Case |
| `analysis_staff` | 분석팀 | 신청·보정루프 Stage Case |
| `correction_staff` | 법정 대응 | 기각·즉시항고·폐지 Stage Case |
| `billing_staff` | 결제팀 | Payment 전체 · 미수금 · 독촉 |
| `admin` | 일반 사무 | 최소 접근 (연락·접수만) |

구현:
```sql
ALTER TABLE workspace_members ADD COLUMN role TEXT;
-- 복수 역할 필요 시 별도 테이블
CREATE TABLE workspace_member_roles (
  workspace_id UUID,
  user_id UUID,
  role TEXT,
  PRIMARY KEY (workspace_id, user_id, role)
);
```

---

## 4. v0.3 메타 레이어 (5)

### 4.1 ActionRegistry

Action의 **선언적 정의**.

```typescript
interface ActionSpec {
  key: string;
  label: string;
  description: string;
  subject_types: Array<'lead' | 'case' | 'client' | 'payment'>;
  allowed_roles: Role[];
  required_params: Record<string, 'string' | 'number' | 'date' | 'uuid'>;
  produces?: {
    object_type?: 'communication' | 'document' | 'interaction' | 'court_order' | 'payment';
    event?: string;
    state_change?: string;            // 예: 'lead.status = converted'
  };
  auto_trigger?: {
    on: 'payment.overdue' | 'stage.entered:document_prep' | ...;
    debounce_days?: number;
  };
}
```

DB 병행: `action_registry` 테이블에 행으로 저장 (감사·권한 확인용). TS 모듈은 UX·타입 안정성용.

---

### 4.2 DashboardConfig

역할별 기본 뷰를 **선언적**으로 조립.

```typescript
interface DashboardConfig {
  role: Role;
  title: string;
  sections: DashboardSection[];
}

interface DashboardSection {
  key: string;
  title: string;
  object_type: 'lead' | 'case' | 'payment' | 'action' | 'communication';
  filter: {
    // SQL-ish 표현
    assigned_to?: 'me' | 'my_team';
    status?: string[];
    stage_in?: string[];               // domain-specific
    overdue?: boolean;
    created_within_days?: number;
  };
  columns: Array<{ field: string; label: string }>;
  default_sort: { field: string; direction: 'asc' | 'desc' };
  actions_inline?: string[];            // ACTION_REGISTRY keys
  kpi?: Array<{
    key: string;
    agg: 'count' | 'sum' | 'avg';
    field?: string;
    label: string;
  }>;
}
```

범용 렌더러 1개가 이 config를 받아 UI 생성.

---

### 4.3 StageDefinition

v0.2에서 `StageKey` enum으로 하드코딩. v0.3엔 **DB 시드**.

```sql
CREATE TABLE stage_definitions (
  id UUID PK,
  domain TEXT,                          -- 'personal_rehab' / 'divorce' / ...
  key TEXT,
  label TEXT,
  order_index INT,
  phase TEXT,                           -- 'pre_filing' / 'filing_review' / ...
  primary_role TEXT,                    -- default assigned role
  typical_duration_days INT,
  is_bypass BOOLEAN,
  description TEXT,
  UNIQUE(domain, key)
);

CREATE TABLE stage_transitions (
  id UUID PK,
  domain TEXT,
  from_stage TEXT,
  to_stage TEXT,
  condition TEXT,
  is_bypass BOOLEAN,
  UNIQUE(domain, from_stage, to_stage)
);
```

TS 쪽엔 `getStages(domain)` 동적 로딩. enum 제거.

---

### 4.4 DocumentTypeDefinition

v0.2 `DocumentType` enum 대체.

```sql
CREATE TABLE document_type_definitions (
  id UUID PK,
  domain TEXT,
  key TEXT,
  label TEXT,
  required BOOLEAN,
  source TEXT,                          -- 'client' / 'court' / 'public_record'
  category TEXT,                        -- 'identity' / 'financial' / 'debt' / 'asset' / ...
  used_in_stages TEXT[],
  UNIQUE(domain, key)
);
```

---

### 4.5 RiskFlagDefinition

v0.2 `RISK_FLAGS` 배열 대체.

```sql
CREATE TABLE risk_flag_definitions (
  id UUID PK,
  domain TEXT,
  key TEXT,
  label TEXT,
  level TEXT,                           -- 'red' / 'yellow'
  description TEXT,
  response TEXT,
  activates_actions TEXT[],             -- ACTION_REGISTRY 키들
  UNIQUE(domain, key)
);
```

---

## 5. 관계도 업데이트

```
Lead ──converts_to──> Case
  │                      │
  │                      ├──has──> RepaymentPlan (도메인 전용)
  │                      ├──has──> Debt[], Asset[], Income[], Dependent[]
  │                      ├──has──> Payment[]
  │                      ├──in──>  Stage (시드 정의)
  │                      ├──triggers──> Action[]
  │                      └──generates──> Communication[]
  │                                          ↑
  └──generates──> Communication[] ────────────┘

Client ──owns──> Lead[], Case[]
                   │
                   └──generates──> Communication[]

Actor (workspace_member with role)
  ├──assigned_to──> Lead / Case / Payment / Action
  └──logs──>        Communication
```

### 5.1 다형 관계 패턴

`Communication`·`Action`은 `subject_type` + `subject_id`로 **polymorphic association**. 쿼리 시 `subject_type` 먼저 필터 → subject_id 조인. 인덱스: `(subject_type, subject_id, created_at DESC)`.

DB에서 FK 직접 걸 수 없음 → 애플리케이션 레벨에서 정합성 유지. 대신 `CHECK (subject_type IN (...))` 제약.

---

## 6. Lead → Case 전환 플로우

```
Lead.status=new                  (유입)
  │ Action: log_consultation (Communication 생성)
Lead.status=contacted
  │ Action: qualify_lead (triage_score 갱신)
Lead.status=qualified
  │ Action: convert_to_case
  │   → Case 생성 (case_type 확정)
  │   → Lead.case_id = case.id, status=converted
  │   → Payment(retainer) 생성 (scheduled)
Case 진행 시작
```

분기:
- `qualify_lead` 중 적격성 불충족 → `Lead.status=lost`, `lost_reason` 채움
- `cold` 상태: 30일 이상 무접촉 → 자동 전이 (cron)

---

## 7. Payment 사이클

```
Case 생성 시 자동 Payment(retainer) 생성 (scheduled)
  │
  ├─ Action: confirm_payment (paid_amount 갱신)
  │     → status = partial 또는 paid
  │
  ├─ cron 일단위: due_date 경과 AND status != paid
  │     → status = overdue
  │     → Action 자동 생성: send_dunning
  │
  └─ billing_staff Dashboard에 overdue 노출
```

성공보수: Case.discharge_date 기록 시 자동 Payment(success_fee) 생성 (waived 기본, 활성화 액션).

---

## 8. Role × Dashboard 매트릭스

| 역할 | 기본 Object 뷰 | 주요 KPI | 주요 Action |
|---|---|---|---|
| **상담원** | `leads.assigned_consultant_id=me` · status ∈ {new,contacted,qualified} | 오늘 신규 N · 이번달 전환율 · 30일 미접촉 Lead 수 | `log_consultation`, `qualify_lead`, `convert_to_case`, `drop_lead` |
| **변호사** | `cases.assigned_to=me` · active | 진행 사건 N · 오늘 마감 Action · 보정 대기 | `advance_stage`, `create_action`, `file_petition`, `respond_correction` |
| **서류팀** | `cases WHERE stage=document_prep` (팀 할당) | 미제출 건수 · 수집 완료율 · 지연 Case | `send_document_request`, `mark_received`, `classify_doc` |
| **분석팀** | `cases WHERE stage IN (filing, correction_loop)` | 편파분석 대기 · 시뮬 미완 | `analyze_preferential`, `simulate_repayment`, `draft_petition` |
| **법정 대응** | `cases WHERE stage IN (dismissal, immediate_appeal, termination)` | 항고 임박 · 폐지 경고 | `file_appeal`, `draft_statement`, `precedent_lookup` |
| **결제팀** | `payments WHERE status IN (overdue, partial, scheduled)` | 미수금 총액 · 독촉 발송 건수 · 수금률 | `send_dunning`, `confirm_payment`, `waive_payment`, `issue_invoice` |
| **대표변호사** | 전사 Pipeline · 담당자별 Workload · 재무 KPI | 월 수임 · 미수금 · Stage별 병목 · 직원 생산성 | 모든 Action · 할당 재배치 · 역할 관리 |
| **일반 사무** | `actions.assigned_to=me` · 최근 Communication | 오늘 내 할일 | `log_communication`, `update_contact` |

---

## 9. ACTION_REGISTRY 초안 (28개)

### 9.1 Lead 관련
| key | 라벨 | 허용 역할 | 생성물 |
|---|---|---|---|
| `create_lead` | 리드 등록 | consultant, managing_partner, admin | Lead |
| `log_consultation` | 상담 기록 | consultant, managing_partner | Communication |
| `qualify_lead` | 자격 판정 | consultant, managing_partner | Lead 상태 갱신 |
| `convert_to_case` | 수임 확정 | consultant, attorney, managing_partner | Case + Payment(retainer) |
| `drop_lead` | 리드 이탈 처리 | consultant, managing_partner | Lead 상태=lost |
| `reassign_consultant` | 상담원 재배정 | managing_partner | Lead 담당 변경 |

### 9.2 Case 관련 (개인회생)
| key | 라벨 | 허용 역할 |
|---|---|---|
| `upsert_debtor` | 채무자 프로필 입력 | attorney, managing_partner |
| `add_debt` / `add_asset` / `add_income` / `add_dependent` | 채무·재산·소득·부양 CRUD | attorney, document_staff |
| `analyze_preferential` | 편파변제 분석 | analysis_staff, attorney |
| `simulate_repayment` | 변제계획 시뮬 | analysis_staff, attorney |
| `advance_stage` | Stage 전이 | attorney, managing_partner |
| `respond_correction` | 보정 대응 | correction_staff, attorney |
| `file_appeal` | 즉시항고 | correction_staff, attorney, managing_partner |
| `draft_petition` | 신청서 초안 | analysis_staff, attorney |
| `log_court_order` | 법원 명령 기록 | attorney |
| `record_repayment_event` | 변제 이벤트 기록 | billing_staff, attorney |

### 9.3 Communication 관련
| key | 라벨 | 허용 역할 |
|---|---|---|
| `log_communication` | 접촉 기록 | 모두 |
| `import_kakao_chat` | 카톡 대화 가져오기 | consultant, attorney |
| `send_kakao_message` | 카톡 발송 | 해당 주제 담당 + 대표 |

### 9.4 Payment 관련
| key | 라벨 | 허용 역할 | 생성물 |
|---|---|---|---|
| `create_payment` | 결제 생성 | billing_staff, managing_partner | Payment |
| `confirm_payment` | 입금 확인 | billing_staff, managing_partner | Payment 상태 갱신 |
| `send_dunning` | 독촉 발송 | billing_staff | Communication(outbound) |
| `waive_payment` | 결제 면제 | managing_partner | Payment 상태=waived |
| `issue_invoice` | 세금계산서 발행 | billing_staff, managing_partner | 외부 연동 |
| `refund_payment` | 환불 처리 | managing_partner | Payment 상태=refunded |

### 9.5 시스템 Action (자동)
| key | 라벨 | 트리거 |
|---|---|---|
| `auto_overdue_check` | 일단위 연체 감지 | cron daily |
| `auto_cold_lead` | 30일 미접촉 리드 표시 | cron daily |
| `auto_stage_deadline_warning` | Stage 장기체류 경고 | cron weekly |

---

## 10. 확장 레시피

### 10.1 새 도메인 추가 (예: 이혼)
1. 도메인 온톨로지 문서 작성 (현재 `personal_rehab_ontology_v0.2.html` 형식)
2. `stage_definitions` / `document_type_definitions` / `risk_flag_definitions`에 시드 추가
3. (필요 시) 도메인 전용 엔티티 테이블 추가 (예: `divorce_marriage_info`) — 13개 복제 아님, 도메인 특화만
4. `src/lib/ontology/domains/divorce/calculations.ts` — 도메인 계산 모듈
5. `ACTION_REGISTRY`에 도메인 특화 Action 추가
6. `DashboardConfig`에 필요 시 필터 조건 추가

### 10.2 새 역할 추가
1. `Role` 유니온에 키 추가
2. `workspace_members.role` 허용값 갱신
3. `DashboardConfig` 행 추가
4. `ACTION_REGISTRY`의 `allowed_roles`에 포함시킬 Action 지정

### 10.3 새 Action 추가
1. `ACTION_REGISTRY`에 행 추가
2. 실행 핸들러 작성 (`src/lib/actions/{key}.ts`)
3. 해당 역할 Dashboard 섹션의 `actions_inline`에 등록

---

## 11. v0.2 → v0.3 마이그레이션 경로

### 11.1 단계
1. **DB 추가 (additive)** — 기존 `rehab_*` 테이블 유지, 신규 테이블 13개 추가 (`leads`, `communications`, `payments`, `actions`, `workspace_member_roles`, `stage_definitions`, `stage_transitions`, `document_type_definitions`, `risk_flag_definitions`, `action_registry`, `dashboard_configs`, `action_registry`, `case_team_assignments`)
2. **시드 이관** — TS enum(STAGES, DOCUMENTS, RISK_FLAGS)을 시드 SQL로 변환해 v0.3 테이블 로드
3. **코드 레이어 재구성** — `src/lib/ontology/core/*`에 범용 엔티티·레지스트리. 기존 `personal_rehab`은 도메인 모듈로 남음
4. **UI 교체** — `/workflow` 범용 렌더러로 대체. 역할별 Dashboard 5개 추가
5. **역할 마이그레이션** — 기존 사용자는 `managing_partner`로 초기화 (자의적)
6. **자동화** — overdue·cold_lead cron 배치

### 11.2 호환성 전략
- 기존 `cases.assigned_to` 유지. `case_team_assignments`는 **추가**만.
- 기존 `rehab_stage_history` 유지. `current_stage_key` 변경은 TS enum → 시드 key lookup으로만 바뀜.
- 기존 `rehab_*` 테이블 스키마 **변경 없음**.

---

## 12. 미포함 (v0.4+ 확장 여지)

- **AI 자동화 레이어**: 카톡 자동 요약 → Communication 생성, 서류 OCR → Document 자동 분류, 편파변제 탐지 자동화
- **외부 연동**: 세금계산서(팝빌·홈택스), SMS·카카오알림톡 게이트웨이, 전자소송 API
- **워크플로우 DSL**: `auto_trigger` 복잡 조건을 코드 대신 DSL로
- **판례 RAG**: CourtOrder·Interaction과 연결된 판례 검색 인덱스
- **사용자 활동 분석**: 상담원별 전환율 퍼널, 변호사별 Stage 소요시간, 결제팀 회수율

---

## 13. v0.3 변경 로그

**신규 엔티티**
- Lead, Communication, Payment, Action, Role

**메타 엔티티 (신규)**
- ActionRegistry, DashboardConfig, StageDefinition, DocumentTypeDefinition, RiskFlagDefinition

**구조 변경**
- Stage·DocumentType·RiskFlag: TypeScript enum → DB 시드 테이블
- `workspace_members.role` 컬럼 추가
- 다형 관계(polymorphic) 도입: Communication·Action의 `subject_type`+`subject_id`
- Case 할당: `cases.assigned_to` 단일 → `case_team_assignments` 다중 병존

**v0.2 호환성**
- `rehab_*` 테이블 스키마 변경 없음
- 도메인 계산 모듈(personal_rehab) 그대로

**제거**
- 없음 (additive-only 릴리스)

---

## 14. 구현 우선순위 (권고)

핵심 경로 순으로:

1. **Role + workspace_member_roles 추가** — 권한 축
2. **Lead + Communication** — 상담원 대시보드 가능
3. **Payment** — 결제팀 대시보드 가능
4. **Action + ACTION_REGISTRY** — 업무 실행 단일화
5. **DashboardConfig + 범용 렌더러** — 역할별 화면 선언적 조립
6. **Stage/Document/RiskFlag 시드화** — 도메인 추가 비용 축소
7. **자동화 cron** — overdue, cold_lead, stage_deadline

각 단계는 **독립 배포 가능**하며 이전 단계 결과 위에 누적됨.
