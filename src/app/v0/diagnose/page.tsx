'use client';

import { useState } from 'react';
import { AppShell, showToast } from '../AppShell';

type Scores = Record<string, number>;

export default function DiagnosePage() {
  const [url, setUrl] = useState('https://welcome-law.kr');
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<Scores | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  async function run() {
    if (!url.trim()) {
      showToast('URL을 입력하세요');
      return;
    }
    setLoading(true);
    setScores(null);
    setIssues([]);

    await new Promise((r) => setTimeout(r, 1200));

    setScores({
      '사이트 헬스': 72,
      'SEO': 81,
      '변협': 54,
      'GEO': 31,
      '콘텐츠': 76,
    });
    setIssues([
      '변협 §31 위반 카피 2건 (전관·승소율 보장 표현)',
      'AI 검색 인용 0건 (경쟁사 평균 5건)',
      '페이지 속도 모바일 4.2초 (권장 2.5초)',
      '메타 description 누락 7페이지',
      '네이버 블로그 7일 발행 없음 (영정 위험)',
    ]);
    setLoading(false);
  }

  return (
    <AppShell crumb="사이트 진단">
      <h1 className="v0-h1">사이트 진단</h1>
      <p className="v0-sub">URL 입력 시 즉시 SEO·EEAT·변협·GEO·콘텐츠 23개 항목 분석</p>

      <div className="v0-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="v0-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://welcome-law.kr" />
          <button className="v0-btn" onClick={run} disabled={loading}>
            {loading ? '분석 중' : '진단 시작'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
          결과는 임시 저장. 가입 시 영구 저장 + 매일 자동 갱신.
        </div>
      </div>

      {loading && (
        <div className="v0-card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>분석 중...</div>
          <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--text), var(--text-2), var(--text))',
                backgroundSize: '200% 100%',
                animation: 'v0shimmer 1.4s infinite',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
            <span>사이트 헬스</span><span>SEO</span><span>변협</span><span>GEO</span><span>콘텐츠</span>
          </div>
          <style>{`@keyframes v0shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }`}</style>
        </div>
      )}

      {scores && (
        <div className="v0-card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            {Object.entries(scores).map(([k, v]) => {
              const color = v >= 75 ? '#10B981' : v >= 50 ? '#F59E0B' : '#EF4444';
              return (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color }}>{v}</div>
                  <div style={{ height: 3, background: 'var(--surface-2)', marginTop: 4, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: color, width: `${v}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>핵심 문제 {issues.length}건</div>
          {issues.map((s, i) => (
            <div className="v0-row" key={i}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--danger-fg)', marginRight: 6 }}>{i + 1}.</span>
                {s}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
