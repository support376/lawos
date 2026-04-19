# LawOS Supabase 셋업

## 파일 구성

```
supabase/
  migrations/
    20260418000001_initial_schema.sql     -- 10개 테이블 + 인덱스
    20260418000002_rls_policies.sql       -- RLS (워크스페이스 격리)
    20260418000003_signup_provisioning.sql -- 가입 시 자동 생성 트리거
```

## 적용 방법

### 옵션 A: 대시보드 SQL 에디터 (가장 빠름)

1. https://supabase.com/dashboard 에서 신규 프로젝트 생성
   - Region: `Northeast Asia (Tokyo)` (서울 없음, 레이턴시 ~50ms)
   - DB password 기록해둘 것
2. Project → SQL Editor → New query
3. `20260418000001_initial_schema.sql` 전체 복붙 → Run
4. `20260418000002_rls_policies.sql` 전체 복붙 → Run
5. `20260418000003_signup_provisioning.sql` 전체 복붙 → Run
6. Authentication → Providers에서 Google OAuth 활성화 (선택)

### 옵션 B: Supabase CLI (재현 가능)

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## 검증 쿼리

적용 후 SQL 에디터에서:

```sql
-- 10개 테이블 전부 RLS 활성화됐는지
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;

-- 가입 트리거 붙었는지
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

테스트 가입 후:

```sql
SELECT u.email, w.name AS workspace, b.name AS board,
       (SELECT count(*) FROM public.kanban_columns WHERE board_id = b.id) AS col_count
FROM public.users u
JOIN public.workspaces w ON w.owner_id = u.id
JOIN public.kanban_boards b ON b.workspace_id = w.id;
```

→ 가입 1명당 1행, `col_count = 5` 나와야 정상.

## 필요한 환경변수 (Next.js용)

Project → Settings → API에서 복사:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 서버 전용, 절대 클라이언트 노출 금지
```
