'use client';

import { AppShell, openSignup } from '../AppShell';
import { useV0State } from '../state';

const AGENTS = [
  { ico: '콜', name: '콜 사무장 김도우미', role: '재판·외근 시 1차 응대', desc: '캘린더 부재 시간만 자동 ON. 변호사 폰 동시 울림 후 미수신 시 응대.', meta1: '월 200건', meta2: '응답 3초', price: '시간 5천 · 월 9.9만', cta: '신청' },
  { ico: '챗', name: '인테이크봇 박매니저', role: '24h 챗 1차 응대', desc: '홈·카카오·로톡 문의 자동 분류. 사건 유형별 핸드오프.', meta1: '무제한', meta2: '응답 2초', price: '셋업 19만 + 건당 1천', cta: '신청' },
  { ico: '작', name: '콘텐츠 작가 이작가', role: '블로그·쇼츠 작성', desc: 'AI 60% + 변호사 40% 검수. 변협 통과한 글만 발행.', meta1: '주 7건', meta2: '건당 30분', price: '건당 5~30만', cta: '신청' },
  { ico: '검', name: '광고규제 검증 최감독', role: '발신 전 자동 차단', desc: '변협 §23·§31·§34 자동 검증. 위반 이력 자동 기록.', meta1: '무제한', meta2: '실시간', price: '무료 (Pro)', cta: '활성화' },
  { ico: '탐', name: 'GEO 추적 정탐색', role: 'AI 검색 인용', desc: 'ChatGPT·Cue·Gemini 인용 주 1회 자동 체크.', meta1: '키워드 30개', meta2: '주 1회', price: '무료 (Pro)', cta: '활성화' },
  { ico: 'SEO', name: 'SEO 사무장 박분석', role: '키워드·내부링크', desc: '키워드 갭·내부 링크·메타 자동 제안.', meta1: '주 1리포트', meta2: '키워드 100개', price: '월 9.9만', cta: '신청' },
];

export default function AgentsPage() {
  const { state, hydrated } = useV0State();
  if (!hydrated) return <AppShell crumb="사무장"><div /></AppShell>;

  return (
    <AppShell crumb="사무장">
      <h1 className="v0-h1">AI 사무장 카탈로그</h1>
      <p className="v0-sub">시간제 또는 건당 위임 · 활성화 = 유료 · 신청 → 1:1 견적</p>

      <div className="v0-agent-grid">
        {AGENTS.map((a) => (
          <div className="v0-agent" key={a.name}>
            <div className="v0-agent-head">
              <div className="v0-avatar">{a.ico}</div>
              <div>
                <div className="v0-agent-name">{a.name}</div>
                <div className="v0-agent-role">{a.role}</div>
              </div>
            </div>
            <div className="v0-agent-desc">{a.desc}</div>
            <div className="v0-agent-meta">
              <span>{a.meta1}</span>
              <span>{a.meta2}</span>
            </div>
            <div className="v0-agent-action">
              <div className="v0-agent-price">{a.price}</div>
              <button className="v0-btn-warn" onClick={() => openSignup(a.name)}>{a.cta}</button>
            </div>
          </div>
        ))}
      </div>

      <div className="v0-card" style={{ marginTop: 16 }}>
        <div className="v0-card-h">
          신청 이력 <span className="v0-pill v0-pill-mine">{state.requests.length}건</span>
        </div>
        {state.requests.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 0' }}>신청 이력 없음.</div>
        ) : (
          state.requests.slice(-5).reverse().map((r, i) => (
            <div className="v0-row" key={i}>
              <div style={{ fontSize: 12 }}>{r.action}</div>
              <div className="v0-row-meta">
                {new Date(r.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 20, padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--rl)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>행정 백엔드는 LawOS가 처리합니다.</strong>
        <br />
        통화 회선·녹취·STT·결제·캘린더 sync·문자 발송·계약서 보관·KYC·보안 로그 — 변호사는 사무장의 결과물만 검토.
      </div>
    </AppShell>
  );
}
