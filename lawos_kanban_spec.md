# LawOS 칸반 시스템 기획서 (V1)

**작성 목적:** 가입 즉시 개인 칸반이 생성되고, 수동/자동 양방향으로 티켓을 관리할 수 있는 MVP 구축
**대상:** 개발자 핸드오프용 스펙. 이 문서만으로 프론트/백/DB 구현 가능해야 함
**범위:** V1 칸반 코어 + 이벤트 인제션 엔드포인트 오픈 (티켓 자동 생성 로직은 V1.5에서 연결)

---

## 1. 핵심 설계 원칙

1. **가입 즉시 칸반 provisioning** — 별도 setup 없이 가입 완료 = 워크스페이스 + 기본 칸반 생성 완료
2. **수동 우선, AI는 나중에 얹기** — V1은 AI 없이도 완전 작동하는 칸반. AI 티켓 생성은 같은 스키마 위에 나중에 레이어드
3. **이벤트 엔드포인트는 미리 오픈** — 실제 인제션 파이프라인은 V1.5지만, API 계약은 V1에서 확정. 외부 시스템이 붙을 준비 완료
4. **변호사 개입 지점은 정확히 2곳** — Triage 승인, Review & Send 발송 승인. 나머지는 자동/자율
5. **Multi-tenancy 처음부터** — 모든 데이터는 `workspace_id`로 격리. 한 사용자 데이터가 다른 사용자에게 절대 노출 안 됨

---

## 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────┐
│ Frontend (Next.js + React)                        │
│  - 칸반 보드, 티켓 상세, 고객/사건 관리             │
└────────────────┬─────────────────────────────────┘
                 │ REST/JSON
┌────────────────▼─────────────────────────────────┐
│ Backend API (Next.js API Routes 또는 별도 서버)     │
│  - 인증, CRUD, 상태 전이, 권한 검증                 │
└────────┬────────────────────┬────────────────────┘
         │                    │
┌────────▼──────┐   ┌─────────▼─────────┐
│ Postgres      │   │ External Services  │
│ (Supabase)    │   │ - Gmail API        │
│ - 핵심 데이터  │   │ - Google Calendar  │
│ - RLS로 격리  │   │ - (V1.5) STT, 카톡 │
└───────────────┘   └────────────────────┘
```

**V1에서 만드는 것:** Frontend, Backend, Postgres
**V1에서 API만 열고 구현 안 하는 것:** 이벤트 인제션 엔드포인트 (엔드포인트는 응답하되, 받은 데이터를 DB에만 저장하고 티켓 생성은 안 함)
**V1.5에서 추가:** 티켓 자동 생성, Gmail/Calendar 실제 연동, STT

---

## 3. 가입 및 초기 워크스페이스 프로비저닝

### 3.1 가입 플로우

1. 사용자가 이메일 + 비밀번호 또는 Google OAuth로 가입
2. 백엔드에서 **단일 트랜잭션**으로 다음 생성:
   - `users` 레코드 (인증 정보)
   - `workspaces` 레코드 (이름: "{user_name}의 워크스페이스")
   - `workspace_members` 레코드 (user_id, workspace_id, role='owner')
   - `kanban_boards` 레코드 (workspace_id, name='내 사건 관리')
   - 5개의 `kanban_columns` 레코드 (기본 컬럼)
3. JWT 발급 후 `/kanban`으로 리다이렉트

### 3.2 기본 칸반 컬럼 5개

가입 즉시 아래 컬럼이 순서대로 생성됨:

| order | name | key | color |
|-------|------|-----|-------|
| 1 | Triage | `triage` | gray |
| 2 | To Do | `todo` | blue |
| 3 | In Progress | `in_progress` | amber |
| 4 | Review & Send | `review` | purple |
| 5 | Done | `done` | green |

### 3.3 Empty State (첫 로그인 시 화면)

신규 사용자는 클라이언트/사건/티켓 0개 상태. 아래 3개 CTA 노출:

1. **"첫 고객 추가하기"** → 고객 생성 모달
2. **"샘플 데이터 불러오기"** → 개인회생 예시 고객 1명 + 티켓 5개 로드 (제품 체험용, 언제든 삭제 가능)
3. **"데모 영상 보기"** → 1분 영상

Triage 컬럼 상단에 고정 안내: *"여기에 AI가 감지한 할일 후보가 나타납니다. 현재는 수동으로 티켓을 만들 수 있어요."*

---

## 4. 데이터 모델

### 4.1 ERD 개요

```
users ──┬── workspace_members ──┐
        │                        │
        │                        ▼
        └──────────────── workspaces ──┬── kanban_boards ── kanban_columns
                                       │
                                       ├── clients ──────── cases ──── tickets
                                       │                                │
                                       └── events ─────────────────────┘
                                                        (source_event_id)
```

### 4.2 핵심 테이블 스키마 (Postgres)

```sql
-- 사용자 (인증)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  auth_provider TEXT,  -- 'email' | 'google'
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- 워크스페이스 (multi-tenancy 경계)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 워크스페이스 멤버 (V1은 owner 1명만, V2에서 팀)
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'owner' | 'member'
  PRIMARY KEY (workspace_id, user_id)
);

-- 칸반 보드 (V1은 워크스페이스당 1개)
CREATE TABLE kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 칸반 컬럼
CREATE TABLE kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
  key TEXT NOT NULL,            -- 'triage' | 'todo' | 'in_progress' | 'review' | 'done'
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  color TEXT
);

-- 고객
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사건
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  case_type TEXT,              -- 'personal_rehab' | 'divorce' | 'criminal' | 'other'
  stage TEXT,                  -- 'initial' | 'in_progress' | 'closed'
  status TEXT DEFAULT 'active', -- 'active' | 'archived'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 이벤트 (외부에서 들어온 원본 데이터, V1에서는 저장만)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,    -- 'audio_upload' | 'email' | 'kakao' | 'realtime_audio' | 'manual'
  raw_content TEXT,             -- 원본 텍스트/전사
  metadata JSONB,               -- 발신자, 타임스탬프, 파일 URL 등
  client_id UUID REFERENCES clients(id),  -- 자동/수동 매칭 결과
  case_id UUID REFERENCES cases(id),
  processed BOOLEAN DEFAULT false,  -- V1.5에서 티켓 생성 완료 여부
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 티켓 (제품의 핵심)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL,     -- 'triage' | 'todo' | 'in_progress' | 'review' | 'done'
  "order" INTEGER NOT NULL,     -- 컬럼 내 순서

  case_id UUID REFERENCES cases(id),
  client_id UUID REFERENCES clients(id),

  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,           -- 'promise' | 'document_request' | 'follow_up' (V1 3종)
  priority INTEGER DEFAULT 2,   -- 1(urgent) ~ 4(low)

  due_date DATE,
  waiting_on TEXT,              -- NULL | 'client' | 'court' | 'opposing'

  -- AI 관련 (V1에선 전부 NULL, V1.5에서 채워짐)
  source_event_id UUID REFERENCES events(id),
  ai_suggested BOOLEAN DEFAULT false,
  ai_reasoning TEXT,
  ai_confidence NUMERIC(3,2),   -- 0.00 ~ 1.00

  -- Review & Send 관련
  draft_payload JSONB,          -- 이메일 초안, 캘린더 이벤트 등
  action_type TEXT,             -- 'send_email' | 'create_calendar' | 'manual' | NULL

  -- 메타
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tickets_board_column ON tickets(board_id, column_key, "order");
CREATE INDEX idx_tickets_case ON tickets(case_id);
CREATE INDEX idx_tickets_client ON tickets(client_id);

-- 티켓 활동 로그 (감사/이력)
CREATE TABLE ticket_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,        -- 'created' | 'moved' | 'edited' | 'approved' | 'rejected' | 'sent'
  from_value JSONB,
  to_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Row-Level Security (RLS)

Supabase 사용 시 모든 테이블에 RLS 적용. 기본 정책:

```sql
-- 예: tickets 테이블
CREATE POLICY "workspace_members_only" ON tickets
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
```

이걸 `clients`, `cases`, `events`, `tickets`, `kanban_boards`, `kanban_columns` 전부에 동일 패턴 적용. Backend 실수로 격리 깨뜨리는 걸 DB 레벨에서 방어.

---

## 5. 칸반 컬럼 상세 정의

### 5.1 컬럼별 역할

| 컬럼 | 의미 | 진입 | 이탈 | 비고 |
|-----|-----|-----|-----|-----|
| Triage | AI 감지 할일 후보. 변호사 승인 대기 | V1: 빈 상태 / V1.5: 이벤트 파이프라인 | 승인→To Do / 기각→삭제 | V1에서도 구조는 미리 구현 |
| To Do | 승인된 할일. 착수 대기 | Triage 승인 / 수동 생성 | 착수 → In Progress | 기본 작업 대기열 |
| In Progress | 작업 중 | 착수 액션 | 완료 / 초안 작성 → Review | `waiting_on` 라벨로 대기 상태 표시 |
| Review & Send | 작업물 준비 완료. 발송/실행 대기 | 초안 완성 | 발송 승인 → Done | `draft_payload` 반드시 있음 |
| Done | 실행 완료 | Review 승인 → 자동 실행 | 없음 (보관) | 30일 후 자동 아카이브 |

### 5.2 상태 전이 규칙 (State Transition)

**허용되는 전이:**

```
Triage ──승인──> To Do
Triage ──기각──> (삭제)

To Do ──착수──> In Progress
To Do ──> Triage (되돌리기, AI 생성 티켓만)

In Progress ──초안 완성──> Review & Send
In Progress ──즉시 완료──> Done (단순 업무)
In Progress ──> To Do (착수 취소)

Review & Send ──승인+발송──> Done  [side effect 실행]
Review & Send ──> In Progress (재작업)

Done ──> (변경 불가, 필요 시 관리자만)
```

**금지된 전이:**
- Triage에서 In Progress/Review/Done로 직접 이동 금지 (반드시 To Do 경유)
- Done에서 뒤로 이동 금지 (감사 이력 보존)

### 5.3 Waiting 라벨

컬럼 아님. In Progress 티켓의 부가 속성 (`waiting_on` 필드):

- `client`: 고객 회신 대기
- `court`: 법원 응답 대기
- `opposing`: 상대방/상대 변호사 대기
- `NULL`: 활성 작업 중

**자동 리마인더:** `waiting_on != NULL` 상태로 3일 경과 시 `follow_up` 타입 티켓을 Triage에 자동 생성 (V1.5 기능, V1은 플래그만 세팅).

### 5.4 Triage 컬럼의 시각적 분리

Triage는 "내 할일"이 아니라 "검토 대기 큐"이므로 UI에서 구분:

- 메인 보드 **좌측에 별도 고정 영역** 또는 **상단 접이식 띠**로 표시
- Triage 티켓은 회색 톤 + "AI 제안" 배지 + 승인/기각 버튼 즉시 노출
- 메인 보드 4컬럼(To Do ~ Done)은 밝은 톤, 일반 편집 가능
- 신규 사용자에게 Triage는 빈 상태 + "AI 기능 준비 중" 안내

---

## 6. 티켓 상세 설계

### 6.1 V1 티켓 타입 3종

| type | 한글 | 용도 | 필수 필드 |
|-----|-----|-----|---------|
| `promise` | 구두약속 | "X까지 Y해드리겠습니다" | title, due_date, client_id |
| `document_request` | 서류요청 | 고객에게 받아야 할 자료 | title, client_id |
| `follow_up` | 후속확인 | 연락 필요, 상태 확인 | title, client_id |

V1.5에서 추가될 타입: `research` (자료조사), `filing` (법원 제출), `communication` (커뮤니케이션)

### 6.2 티켓 카드 표시 요소

**칸반 카드(요약 뷰):**
- 타이틀 (1-2줄)
- 고객명 + 사건 유형 뱃지
- 타입 아이콘 (promise=🤝, doc=📄, follow_up=🔔)
- 우선순위 컬러 바 (좌측 테두리)
- 마감일 (D-n 표시, 지연 시 빨강)
- `waiting_on` 라벨 (있을 때만)
- AI 배지 (`ai_suggested=true`일 때)

**티켓 상세 패널 (우측 슬라이드):**
- 전체 설명
- 메타데이터 (생성자, 생성일, 최근 수정)
- **"원본 보기" 링크** (`source_event_id`가 있을 때 → 원본 전사/이메일/카톡으로 점프)
- 활동 로그 (ticket_activities 조회)
- Review & Send 단계면 draft_payload 프리뷰
- 상태 전이 버튼

---

## 7. UI 구성

### 7.1 메인 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│ 상단 네비  [LawOS]  오늘  고객  칸반  검색       프로필   │
├──────────┬───────────────────────────────────────────────┤
│          │  [칸반 보드]                                    │
│ 사이드바  │                                                │
│          │  ┌─Triage─┬─To Do─┬─In Prog─┬─Review─┬─Done─┐ │
│ 고객     │  │ (AI)   │       │         │         │       │ │
│ (100건)  │  │  ...   │  ...  │  ...    │  ...    │  ...  │ │
│          │  └────────┴───────┴─────────┴─────────┴───────┘ │
│ 필터:    │                                                │
│ - 전체   │  [+ 새 티켓]                                    │
│ - 김○○   │                                                │
│ - 이○○   │                                                │
└──────────┴───────────────────────────────────────────────┘
```

### 7.2 주요 화면 & 라우트

| 경로 | 화면 | 설명 |
|-----|-----|-----|
| `/signup` | 가입 | 이메일/OAuth |
| `/login` | 로그인 | |
| `/kanban` | 메인 칸반 (전체) | 모든 고객 across |
| `/kanban?client={id}` | 고객별 칸반 | 필터 적용 |
| `/clients` | 고객 리스트 | 100건 관리 뷰 |
| `/clients/{id}` | 고객 상세 | 사건 + 티켓 + 이벤트 히스토리 |
| `/today` | 오늘 대시보드 | 오늘 할일 / 지연 / 연락 필요 |
| `/settings` | 설정 | 프로필, API 키 등 |

### 7.3 컴포넌트 계층 (React)

```
<KanbanPage>
  <Sidebar>
    <ClientList />
    <Filters />
  </Sidebar>
  <KanbanBoard>
    <TriageColumn />  // 특수 처리
    <Column key="todo" />
    <Column key="in_progress" />
    <Column key="review" />
    <Column key="done" />
  </KanbanBoard>
  <TicketDetailPanel />  // 슬라이드 아웃
  <NewTicketModal />
</KanbanPage>
```

드래그앤드롭: `@dnd-kit/core` + `@dnd-kit/sortable`

---

## 8. API 엔드포인트

### 8.1 인증

- **세션용:** JWT (쿠키 또는 Authorization 헤더)
- **외부 이벤트 푸시용:** 워크스페이스별 API Key (설정 화면에서 발급)

### 8.2 내부 API (프론트 → 백)

```
POST   /api/v1/auth/signup          # 가입 + 워크스페이스 자동 생성
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/workspaces/current   # 현재 워크스페이스 정보
PATCH  /api/v1/workspaces/current

GET    /api/v1/clients              # 고객 리스트
POST   /api/v1/clients              # 고객 생성
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
DELETE /api/v1/clients/:id

GET    /api/v1/cases
POST   /api/v1/cases
GET    /api/v1/cases/:id
PATCH  /api/v1/cases/:id

GET    /api/v1/tickets              # ?client_id=&case_id=&column=&status=
POST   /api/v1/tickets              # 수동 생성
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id          # 편집
POST   /api/v1/tickets/:id/move     # 컬럼 이동 (상태 전이)
POST   /api/v1/tickets/:id/approve  # Triage → To Do
POST   /api/v1/tickets/:id/reject   # Triage → 삭제
POST   /api/v1/tickets/:id/execute  # Review & Send → Done (side effect 실행)
DELETE /api/v1/tickets/:id

GET    /api/v1/board                # 칸반 전체 상태 (컬럼 + 티켓)
```

### 8.3 공개 이벤트 인제션 엔드포인트 (V1에서 오픈만)

**인증:** `Authorization: Bearer <workspace_api_key>`

**V1 동작:** 이벤트를 `events` 테이블에 저장만. `processed=false`. 티켓 생성 안 함.
**V1.5 동작:** 저장 + 파이프라인 트리거 → 티켓 자동 생성.

```
POST /api/v1/events/audio
  Content-Type: multipart/form-data
  Body: file (audio), client_id? (optional), case_id? (optional), metadata? (JSON)
  Response: { event_id, status: "received" }

POST /api/v1/events/email
  Body: {
    from: "client@example.com",
    to: "lawyer@example.com",
    subject: "...",
    body: "...",
    received_at: "2026-04-18T10:30:00Z",
    thread_id?: "..."
  }
  Response: { event_id, status: "received" }

POST /api/v1/events/kakao
  Body: {
    channel_id: "...",
    participants: ["변호사", "김○○"],
    messages: [
      { sender: "김○○", text: "...", sent_at: "..." },
      ...
    ]
  }
  Response: { event_id, status: "received" }

POST /api/v1/events/generic
  Body: {
    source_type: "custom",
    content: "...",
    metadata: { ... }
  }
  Response: { event_id, status: "received" }

GET /api/v1/events              # 이벤트 리스트 (디버그용)
GET /api/v1/events/:id
```

### 8.4 Side Effect 실행 엔드포인트

Review & Send 승인 시 내부 호출:

```
POST /api/v1/actions/send_email
  Body: { ticket_id, draft_payload: { to, subject, body, ... } }
  Response: { sent_at, message_id }
  # V1.5: Gmail API 실호출. V1은 mock 응답 + console log

POST /api/v1/actions/create_calendar
  Body: { ticket_id, draft_payload: { title, start, end, ... } }
  Response: { event_id, calendar_link }
  # V1.5: Google Calendar API. V1은 mock.

POST /api/v1/actions/manual_complete
  Body: { ticket_id, notes? }
  Response: { completed_at }
  # "내가 직접 처리했음" 기록
```

---

## 9. 주요 사용자 플로우

### 9.1 가입 → 첫 로그인

```
1. /signup 접속 → Google 로그인
2. [자동] users, workspaces, workspace_members, kanban_boards, 5개 columns 생성
3. /kanban 리다이렉트
4. 빈 칸반 + Empty State 3개 CTA 표시
5. 사용자 선택:
   a) "첫 고객 추가" → 고객 모달 → 저장 후 사건 모달 → 티켓 생성 안내
   b) "샘플 데이터" → 개인회생 예시 1명 + 5개 티켓 로드
   c) "데모 영상"
```

### 9.2 수동 티켓 생성

```
1. 칸반에서 컬럼의 [+ 새 티켓] 클릭 (Triage는 수동 생성 불가, 나머지 4컬럼만)
2. 모달 표시:
   - 타이틀 (필수)
   - 고객 선택 (드롭다운 + "새 고객 만들기")
   - 사건 선택 (고객 선택 시 자동 필터, + "새 사건 만들기")
   - 타입 (promise/document_request/follow_up)
   - 우선순위
   - 마감일
   - 설명
3. 저장 → 선택한 컬럼의 최상단에 추가
```

### 9.3 Triage 승인 플로우 (V1.5부터 실사용)

```
1. Triage 컬럼에 AI 티켓 들어옴 (ai_suggested=true)
2. 변호사가 카드 클릭 → 상세 패널
3. 상세 확인:
   - AI 추출 근거 (ai_reasoning)
   - 원본 이벤트 보기 (source_event_id 링크)
   - 제안된 고객/사건 매칭
4. 선택:
   - [승인] → To Do로 이동, ai_suggested=true 유지 (표시용)
   - [기각] → 삭제, reason 기록
   - [편집 후 승인] → 타이틀/마감일 수정 후 To Do
```

### 9.4 Review & Send 발송 플로우

```
1. In Progress 티켓의 작업 완료 후 "초안 작성" 클릭
2. 타입별 초안 에디터:
   - promise → 고객 안내 이메일 초안
   - document_request → 서류 요청 이메일 초안
   - follow_up → 확인 연락 초안
3. 저장 → Review & Send 컬럼으로 이동, draft_payload 채워짐
4. 검토 → [발송] 클릭
5. action_type 분기:
   - send_email: Gmail API 호출 (V1은 mock)
   - create_calendar: Calendar API 호출
   - manual: "직접 처리함" 기록만
6. 성공 시 Done 이동, completed_at 기록, activity log
```

---

## 10. 기술 스택

### 10.1 Frontend
- **Framework:** Next.js 15 + React 19
- **Styling:** Tailwind CSS + shadcn/ui
- **상태관리:** Zustand
- **Drag & Drop:** `@dnd-kit/core` + `@dnd-kit/sortable`
- **폼:** react-hook-form + zod

### 10.2 Backend
- **Framework:** Next.js API Routes (V1) → FastAPI 또는 별도 서버 (V2)
- **DB:** Supabase (Postgres + Auth + Realtime + Storage)
- **벡터 DB:** pgvector (V1.5에서 RAG용)
- **인증:** Supabase Auth (Google OAuth + Email)

### 10.3 배포
- **Frontend:** Vercel
- **Backend/DB:** Supabase (Seoul 리전 없음 → Tokyo 리전, 레이턴시 50ms 수준)
- **도메인:** lawos.kr 또는 lawai.kr

### 10.4 예상 인프라 비용 (첫 50명 기준)
- Vercel: $20/월
- Supabase: $25/월 (Pro plan)
- 도메인: ~$15/년
- **합계: 월 50만원 미만**

---

## 11. V1 범위 vs V1.5+ 범위

### V1에 포함 (이번 문서의 스펙)
- ✅ 가입 + 자동 워크스페이스/칸반 프로비저닝
- ✅ 고객, 사건, 티켓 수동 CRUD
- ✅ 5컬럼 칸반 + 드래그앤드롭
- ✅ 티켓 상태 전이 (허용 규칙 검증)
- ✅ 티켓 타입 3종 (promise/doc_request/follow_up)
- ✅ Waiting 라벨
- ✅ 오늘 대시보드 (지연/마감 임박)
- ✅ 이벤트 인제션 엔드포인트 (저장만, 티켓 생성 X)
- ✅ Side effect 엔드포인트 (mock 응답)

### V1.5에서 추가
- 이벤트 → 티켓 자동 생성 (LLM 파이프라인)
- CaseStateSnapshot 엔진
- Gmail/Calendar API 실제 연동
- STT 연동 (Clova Speech)
- 원본 이벤트 뷰어 (전사/이메일/카톡 원본 표시)

### V2에서 추가
- 카카오톡 비즈니스 API 연동
- 전화 통합 (업무용 번호)
- 공유 판례 RAG
- 사건 유형 확장 (이혼, 형사, 기타)
- 팀 기능 (workspace_members role='member')

### V3 이후
- 실시간 상담 중 쟁점 지도
- 커뮤니티/템플릿 마켓플레이스
- 법원 전자소송 연동

---

## 12. 개발 로드맵 (V1 기준 4주)

### Week 1: 스키마 + 인프라
- Day 1-2: Supabase 프로젝트 셋업, 전체 테이블 마이그레이션, RLS 정책
- Day 3: 가입/로그인 구현 (Supabase Auth)
- Day 4: 가입 시 자동 프로비저닝 트리거 (DB function 또는 signup handler)
- Day 5: 기본 라우팅 + 레이아웃 + 인증 미들웨어

### Week 2: 칸반 코어
- Day 6-7: 칸반 보드 UI (5컬럼 + 드래그앤드롭)
- Day 8: 티켓 카드 컴포넌트 + 상세 패널
- Day 9: 수동 티켓 생성 모달 + CRUD API
- Day 10: 상태 전이 로직 + activity log

### Week 3: 고객/사건 + 필터
- Day 11-12: 고객/사건 CRUD UI + API
- Day 13: 칸반 필터 (고객별, 타입별, 우선순위별)
- Day 14: 오늘 대시보드
- Day 15: Empty state + 샘플 데이터 시딩

### Week 4: 엔드포인트 오픈 + 폴리싱
- Day 16-17: 이벤트 인제션 엔드포인트 (저장만)
- Day 18: Side effect mock 엔드포인트
- Day 19: 설정 화면 (API 키 발급, 프로필)
- Day 20: QA + 버그 수정
- Day 21: 양홍수 변호사 도그푸드 시작

---

## 13. 수락 기준 (V1 완료 판정)

다음 시나리오가 전부 작동하면 V1 완료:

1. **[가입]** 신규 사용자가 Google 로그인 후 5초 내 빈 칸반 화면에 도달
2. **[고객 추가]** "첫 고객 추가" → 김○○ 생성 → 개인회생 사건 생성
3. **[수동 티켓]** 김○○ 사건에 "소득증빙서류 요청" promise 티켓 생성 → Triage 외 4컬럼 중 선택
4. **[상태 이동]** 드래그로 To Do → In Progress → Review & Send → Done 이동
5. **[원본 매칭]** 티켓 상세에서 고객/사건 정보 정확히 표시
6. **[격리]** 다른 테스트 계정으로 로그인 시 A 계정 데이터 전혀 안 보임
7. **[엔드포인트]** Postman으로 `/api/v1/events/email` POST → 200 응답 + events 테이블에 저장 확인
8. **[필터]** 사이드바에서 특정 고객 선택 시 그 고객 티켓만 표시
9. **[오늘]** 오늘 대시보드에서 마감일 today인 티켓 표시
10. **[모바일]** 반응형 칸반이 모바일에서도 작동 (읽기 전용 수준이라도)

---

## 14. 리스크 & 주의사항

1. **가입 자동 프로비저닝 실패 케이스:** 5개 레코드 생성 중 1개라도 실패하면 롤백. DB 트랜잭션 필수.
2. **Triage 빈 상태 혼란:** V1에선 Triage가 영영 비어있음. 사용자가 "이거 고장났나?"라고 오해 안 하게 안내 메시지 명확히.
3. **이벤트 엔드포인트 어뷰즈:** 공개 엔드포인트라 스팸/DDoS 가능. API 키당 rate limit 필요 (분당 60회 정도).
4. **RLS 누락:** 테이블 추가 시 RLS 빠뜨리면 데이터 유출. 마이그레이션 PR 템플릿에 RLS 체크리스트.
5. **draft_payload JSONB 구조 표준화:** action_type별 스키마 미리 정의해두고 검증 (zod).
6. **드래그앤드롭 동시성:** 두 탭에서 같은 티켓 이동 시 충돌. updated_at 기반 optimistic locking.

---

## 15. 부록: action_type별 draft_payload 스키마

### send_email
```json
{
  "to": ["client@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "개인회생 진행상황 안내",
  "body_html": "<p>...</p>",
  "body_text": "...",
  "attachments": []
}
```

### create_calendar
```json
{
  "title": "김○○ 3차 상담",
  "start": "2026-04-20T14:00:00+09:00",
  "end": "2026-04-20T15:00:00+09:00",
  "location": "사무실",
  "attendees": ["client@example.com"],
  "description": "..."
}
```

### manual
```json
{
  "notes": "법원 방문하여 서류 제출 완료"
}
```

---

**문서 버전:** v1.0
**작성일:** 2026-04-18
**다음 업데이트:** V1.5 스펙 (이벤트 → 티켓 자동 생성)
