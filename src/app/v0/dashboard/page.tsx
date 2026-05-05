'use client';

import { useState } from 'react';
import { AppShell, openSignup, showToast } from '../AppShell';
import { useV0State } from '../state';

export default function DashboardPage() {
  const { state, update, hydrated } = useV0State();
  const [kwInput, setKwInput] = useState('');
  const [chType, setChType] = useState('홈페이지');
  const [chUrl, setChUrl] = useState('');

  if (!hydrated) return <AppShell crumb="대시보드"><div /></AppShell>;

  function estimate(text: string) {
    const len = text.length;
    const baseVol = Math.max(500, Math.floor(50000 / Math.max(2, len / 2)));
    const vol = Math.floor((baseVol * (0.6 + Math.random() * 0.8)) / 100) * 100;
    const comp = Math.min(99, Math.max(15, Math.floor(50 + (text.includes('변호사') ? 30 : 0) - len)));
    return { vol, comp };
  }

  function addKeyword() {
    const v = kwInput.trim();
    if (!v) return;
    if (state.keywords.length >= 5 && !state.signedIn) {
      showToast('Free 한도 5개 — 가입 후 30개');
      openSignup('키워드 30개 한도');
      return;
    }
    const est = estimate(v);
    update({
      ...state,
      keywords: [...state.keywords, { text: v, addedAt: Date.now(), rank: '측정 대기', ...est }],
    });
    setKwInput('');
    showToast(`등록 — 월 ${est.vol.toLocaleString()} 검색 · 경쟁 ${est.comp}`);
  }

  function removeKeyword(i: number) {
    update({ ...state, keywords: state.keywords.filter((_, j) => j !== i) });
  }

  function addChannel() {
    const u = chUrl.trim();
    if (!u) return;
    update({
      ...state,
      channels: [...state.channels, { type: chType, url: u, status: 'ok', addedAt: Date.now() }],
    });
    setChUrl('');
  }

  function removeChannel(i: number) {
    update({ ...state, channels: state.channels.filter((_, j) => j !== i) });
  }

  return (
    <AppShell crumb="대시보드">
      <h1 className="v0-h1">이번 주 점검</h1>
      <p className="v0-sub">2026.05.04 — 5.10 · 점검할 것 5개</p>

      <div className="v0-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>사무실 OS 셋업 — 5단계</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{state.signedIn ? '2 / 5' : '1 / 5'} 완료</div>
          </div>
          <div style={{ width: 120, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: state.signedIn ? '40%' : '20%', height: '100%', background: 'var(--success-fg)' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[
            { label: '✓ 완료', name: '사이트 진단', done: true },
            { label: state.signedIn ? '✓ 완료' : '→ 다음', name: '가입 30초', done: state.signedIn, onClick: () => !state.signedIn && openSignup('가입') },
            { label: '대기', name: '채널 연결', done: state.channels.length > 0 },
            { label: '대기', name: '키워드 등록', done: state.keywords.length > 0 },
            { label: '대기', name: '첫 콘텐츠', done: state.contents.length > 0 },
          ].map((step, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                background: step.done ? 'var(--success-bg)' : 'var(--surface-2)',
                borderRadius: 8,
                cursor: step.onClick ? 'pointer' : 'default',
              }}
              onClick={step.onClick}
            >
              <div style={{ fontSize: 11, color: step.done ? 'var(--success-fg)' : 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>
                {step.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: step.done ? 'var(--success-fg)' : 'var(--text)' }}>
                {step.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          이번 주 KPI <span className="v0-pill v0-pill-demo">데모</span>
        </div>
        <button className="v0-btn-2" onClick={() => openSignup('내 사이트 추적')}>내 데이터로 바꾸기</button>
      </div>

      <div className="v0-kpi-grid">
        {[
          { label: '사이트 헬스', value: '87', delta: '▲ 3 vs 지난주', cls: 'v0-up' },
          { label: '광고 ROAS', value: '2.4x', delta: '잡콜 64%', cls: 'v0-up' },
          { label: '이번주 인입', value: '47', delta: '진성 17 · 미응답 5' },
          { label: 'GEO 인용', value: '8', delta: 'ChatGPT 5', cls: 'v0-up' },
        ].map((k) => (
          <div key={k.label} className="v0-kpi">
            <div className="v0-kpi-label">{k.label}</div>
            <div className="v0-kpi-value">{k.value}</div>
            <div className={`v0-kpi-delta ${k.cls || ''}`}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="v0-two-col">
        <div className="v0-card">
          <div className="v0-card-h">
            트렌드 토픽 <span className="v0-pill v0-pill-mine">내 영역</span>
          </div>
          {[
            ['전세사기 처벌강화법 통과', '+95%'],
            ['음주운전 양형기준 개정', '+67%'],
            ['코인사기 회복 판례', '+52%'],
            ['협의이혼 양육비 산정', '+48%'],
            ['임대차 보증금 반환', '+41%'],
          ].map(([name, val]) => (
            <div className="v0-row" key={name}>
              <div>{name}</div>
              <div className="v0-row-meta v0-up">{val}</div>
            </div>
          ))}
        </div>

        <div className="v0-card">
          <div className="v0-card-h">
            채널 점검 <span className="v0-pill v0-pill-demo">데모</span>
          </div>
          {[
            ['v0-d-ok', '홈페이지', '정상'],
            ['v0-d-bad', '네이버 블로그', '7일 발행 X'],
            ['v0-d-ok', '인스타', '@welcome_law'],
            ['v0-d-warn', '유튜브', '3주 X'],
            ['v0-d-off', '카카오 채널', '미연결'],
          ].map(([dot, name, meta]) => (
            <div className="v0-row" key={name}>
              <div>
                <span className={`v0-dot ${dot}`} /> {name}
              </div>
              <div className="v0-row-meta">{meta}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="v0-two-col">
        <div className="v0-card">
          <div className="v0-card-h">
            추적 키워드 <span className="v0-pill v0-pill-mine">{state.keywords.length}/5</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            {state.keywords.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 0' }}>아직 키워드 없음. 아래에서 추가.</div>
            )}
            {state.keywords.map((k, i) => (
              <div className="v0-row" key={i} style={{ padding: '5px 0' }}>
                <div style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {k.text}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="v0-row-meta" style={{ fontSize: 10 }}>
                    {k.vol ? `월 ${k.vol.toLocaleString()} · 경쟁 ${k.comp}` : k.rank}
                  </span>
                  <span style={{ cursor: 'pointer', color: 'var(--text-3)', fontSize: 14 }} onClick={() => removeKeyword(i)}>
                    ×
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="v0-input"
              placeholder="예: 개인회생 변호사 서초"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              style={{ fontSize: 12, padding: '7px 10px' }}
            />
            <button className="v0-btn-2" onClick={addKeyword}>추가</button>
          </div>
        </div>

        <div className="v0-card">
          <div className="v0-card-h">
            채널 등록 <span className="v0-pill v0-pill-mine">{state.channels.length}개</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            {state.channels.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 0' }}>등록된 채널 없음. 아래에서 등록.</div>
            )}
            {state.channels.map((c, i) => (
              <div className="v0-row" key={i} style={{ padding: '5px 0' }}>
                <div style={{ fontSize: 12 }}>
                  <span className="v0-dot v0-d-ok" /> {c.type}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="v0-row-meta">{c.url.length > 22 ? c.url.slice(0, 22) + '...' : c.url}</span>
                  <span style={{ cursor: 'pointer', color: 'var(--text-3)', fontSize: 14 }} onClick={() => removeChannel(i)}>
                    ×
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="v0-input"
              value={chType}
              onChange={(e) => setChType(e.target.value)}
              style={{ fontSize: 12, padding: '7px 10px', flex: '0 0 100px' }}
            >
              <option>홈페이지</option>
              <option>네이버블로그</option>
              <option>유튜브</option>
              <option>인스타</option>
              <option>카카오채널</option>
            </select>
            <input
              className="v0-input"
              placeholder="URL 또는 계정"
              value={chUrl}
              onChange={(e) => setChUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              style={{ fontSize: 12, padding: '7px 10px' }}
            />
            <button className="v0-btn-2" onClick={addChannel}>등록</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
