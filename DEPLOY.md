# LawOS 배포 가이드 (Vercel)

## 1. Vercel CLI 설치 + 로그인

```bash
npm i -g vercel
vercel login
# 이메일 선택 → 이메일 확인 링크 클릭
```

## 2. 프로젝트 링크 + 첫 배포

프로젝트 루트에서:

```bash
cd "C:/Users/user/Desktop/claude/lawOS"
vercel
```

프롬프트 응답:
- Set up and deploy? **Y**
- Which scope? (개인 계정 선택)
- Link to existing project? **N**
- Project name? **lawos** (또는 원하는 이름)
- In which directory is your code located? **./** (Enter)
- Want to modify settings? **N**

첫 배포가 진행됨. URL이 출력되면 복사해둬 (예: `https://lawos-abc123.vercel.app`).

## 3. 환경변수 등록

CLI로:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
# 프롬프트: 값 붙여넣기, Production + Preview + Development 전부 체크

vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# 값 붙여넣기

vercel env add SUPABASE_SECRET_KEY
# 값 붙여넣기, Production만 체크 (또는 전체)

vercel env add ANTHROPIC_API_KEY
# 값 붙여넣기
```

또는 웹 대시보드에서: Project → Settings → Environment Variables 에서 4개 다 추가.

## 4. 재배포 (env 반영)

```bash
vercel --prod
```

Production URL이 나옴 (예: `https://lawos.vercel.app`).

## 5. Supabase Auth URL 업데이트

**Supabase 대시보드 → Authentication → URL Configuration**:

1. **Site URL**: `https://lawos.vercel.app` (본인 URL로)
2. **Redirect URLs**에 다음 추가:
   - `https://lawos.vercel.app/auth/callback`
   - `https://lawos.vercel.app/**` (Vercel 프리뷰 URL 대비)
   - `http://localhost:3000/auth/callback` (로컬 개발)

## 6. 검증

```
https://lawos.vercel.app/signup
```

- [ ] 가입 성공
- [ ] 칸반 빈 화면 정상 표시
- [ ] 붙여넣기 모달 열림 → 분석 동작
- [ ] 폰에서 접속 → 홈화면 설치 가능
- [ ] /today 라우트 정상

## 7. 커스텀 도메인 (선택)

예: `lawos.kr` 등록한 경우:
- Vercel → Project → Settings → Domains → Add `lawos.kr`
- 도메인 등록처에서 DNS 레코드 설정 (Vercel이 안내하는 CNAME/A 레코드)
- Supabase URL도 커스텀 도메인으로 업데이트

## 운영 팁

- **로그**: `vercel logs lawos` 또는 대시보드 Functions 탭
- **롤백**: Deployments 탭에서 이전 배포 → "Promote to Production"
- **브랜치 프리뷰**: `git push` 또는 `vercel` 하면 고유 URL로 배포 (stakeholder 리뷰용)
- **Cron**: 나중에 이메일 다이제스트 도입할 때 Vercel Cron Jobs 사용

## 비용

- Vercel Hobby 플랜: 무료 (상업용 금지). 도그푸드 단계 OK.
- 유료 전환 시점 오면 Pro $20/월/사용자.
- Supabase Pro $25/월.
- Anthropic API: 사용량 기반 (예상 월 $5~30, 사용자당 적음).
