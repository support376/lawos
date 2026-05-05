'use client';

import { useState } from 'react';
import { AppShell, showToast } from '../AppShell';
import { useV0State } from '../state';

export default function AdCheckPage() {
  const { state, update, hydrated } = useV0State();
  const [text, setText] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [details, setDetails] = useState<string>('');

  function run() {
    if (!text.trim()) {
      showToast('검증할 텍스트를 입력하세요');
      return;
    }
    let s = 0;
    const issues: string[] = [];
    if (/전관|보장|승소율 \d+|확률 \d+/.test(text)) {
      s += 35;
      issues.push('§31 전관·과장·보장 표현');
    }
    if (/최고|최단|최저|국내 최/.test(text)) {
      s += 25;
      issues.push('§34 비교광고 표현');
    }
    if (/유리한|쉽게|간단히|확실/.test(text)) {
      s += 20;
      issues.push('§23 광고 일반 — 사실 외 표현');
    }
    s = Math.min(95, s);
    const out = issues.length
      ? `위반 가능성: ${s}/100\n\n위반 조항:\n${issues.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n\n수정안:\n사실 기반 표현으로 변경 권장. '보장·최고·확실' 단어 제거. 사례·판례 인용으로 신뢰도 확보.`
      : `위반 가능성: ${s}/100\n\n검토 결과: 명백한 위반 표현 미발견.\n변협 §23·§31·§34 1차 검토 통과.`;
    setScore(s);
    setDetails(out);
    update({
      ...state,
      adHistory: [{ text, result: out, score: s, at: new Date().toISOString() }, ...state.adHistory].slice(0, 10),
    });
  }

  if (!hydrated) return <AppShell crumb="변협 검증"><div /></AppShell>;

  const color = score === null ? 'var(--text)' : score < 30 ? '#10B981' : score < 60 ? '#F59E0B' : '#EF4444';
  const label = score === null ? '' : score < 30 ? '안전' : score < 60 ? '주의' : '위반 위험';

  return (
    <AppShell crumb="변협 검증">
      <h1 className="v0-h1">변협 광고심사 검증</h1>
      <p className="v0-sub">광고 카피·블로그 글·안내 문구 입력 시 §23·§31·§34 위반 가능성 검사</p>

      <div className="v0-card" style={{ marginBottom: 14 }}>
        <div className="v0-card-h">검증할 텍스트</div>
        <textarea
          className="v0-input"
          rows={4}
          placeholder="예: 전관 출신 변호사가 직접 상담합니다. 승소율 95% 보장."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ resize: 'vertical', minHeight: 80, lineHeight: 1.5 }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="v0-btn" onClick={run}>검증 시작</button>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>변협 광고심사규정 룰북 기반</span>
        </div>

        {score !== null && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)', fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color }}>{score}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>변협 광고심사규정 위반 가능성</div>
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{details}</div>
          </div>
        )}
      </div>

      <div className="v0-card">
        <div className="v0-card-h">
          최근 검증 이력 <span className="v0-pill v0-pill-mine">로컬 저장</span>
        </div>
        {state.adHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0' }}>아직 검증 이력 없음. 위에서 시작.</div>
        ) : (
          state.adHistory.map((h, i) => {
            const date = new Date(h.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const preview = h.text.length > 50 ? h.text.slice(0, 50) + '...' : h.text;
            const c = h.score < 30 ? '#10B981' : h.score < 60 ? '#F59E0B' : '#EF4444';
            return (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>{preview}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c, marginLeft: 12 }}>{h.score}</div>
                </div>
                <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>{date}</div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
