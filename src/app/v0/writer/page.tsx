'use client';

import { useEffect, useState } from 'react';
import { AppShell, openSignup, showToast } from '../AppShell';
import { useV0State } from '../state';

export default function WriterPage() {
  const { state, update, hydrated } = useV0State();
  const [topic, setTopic] = useState('전세사기 처벌강화법 통과');
  const [format, setFormat] = useState('사례분석형');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [aiRatio, setAiRatio] = useState(60);
  const [savedLabel, setSavedLabel] = useState('미저장');

  useEffect(() => {
    if (state.draft) {
      setTitle(state.draft.title || '');
      setBody(state.draft.body || '');
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setSavedLabel('입력 중...');
    const t = setTimeout(() => {
      update({ ...state, draft: { title, body } });
      setSavedLabel('✓ 자동 저장됨');
    }, 1200);
    return () => clearTimeout(t);
  }, [title, body]);

  function generateSkeleton() {
    if (!topic.trim()) {
      showToast('토픽 필요');
      return;
    }
    setTitle(`${topic} — 변호사가 알려드립니다`);
    setBody(`## 1. 무엇이 바뀌었나
2026년 4월 통과된 ${topic}의 핵심 내용. 처벌·기준 변경.

## 2. 사례 분석
[변호사 본인 사례 1개 추가]

## 3. 핵심 쟁점 3가지
적용 시점, 보증 범위, 우선변제권.

## 4. 적용 판례
[판례 번호 추가 — 대법원 2024다XXXXXX]

## 5. 변호사 조언
[본인 의견·경험 추가]

FAQ
Q. 소급 적용?
A. 시행일 이후 사건부터.`);
    showToast('AI 골격 생성 완료');
  }

  function requestReview() {
    if (!title.trim()) {
      showToast('제목 필요');
      return;
    }
    const exists = state.contents.find((c) => c.title === title);
    let next;
    if (exists) {
      next = state.contents.map((c) => (c.title === title ? { ...c, body, status: '검토' as const } : c));
    } else {
      next = [
        ...state.contents,
        { title, body, status: '검토' as const, ai: aiRatio, createdAt: Date.now() },
      ];
    }
    update({ ...state, contents: next, draft: { title, body } });
    showToast('검토 큐로 이동');
  }

  if (!hydrated) return <AppShell crumb="콘텐츠"><div /></AppShell>;

  return (
    <AppShell crumb="콘텐츠 작성">
      <h1 className="v0-h1">콘텐츠 작성</h1>
      <p className="v0-sub">트렌드 토픽 · 포맷 → AI 골격 → 변호사가 사례·판례 채움</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 14 }}>
        <div>
          <div className="v0-card" style={{ marginBottom: 12 }}>
            <div className="v0-card-h">1. 토픽 + 포맷 선택</div>
            <input
              className="v0-input"
              placeholder="예: 전세사기 처벌강화법"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <select className="v0-input" value={format} onChange={(e) => setFormat(e.target.value)} style={{ marginBottom: 8 }}>
              <option>사례분석형</option>
              <option>Q&amp;A형</option>
              <option>체크리스트형</option>
              <option>비교·분류형</option>
              <option>타임라인형</option>
            </select>
            <button className="v0-btn" onClick={generateSkeleton}>AI 골격 생성</button>
          </div>

          <div className="v0-card">
            <div className="v0-card-h" style={{ display: 'flex', alignItems: 'center' }}>
              2. 글 작성 <span className="v0-pill v0-pill-mine" style={{ marginLeft: 8 }}>로컬 저장</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{savedLabel}</span>
            </div>
            <input
              className="v0-input"
              placeholder="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}
            />
            <textarea
              className="v0-input"
              rows={14}
              placeholder="AI 골격 생성 후 내용. 사례·판례·의견은 본인 추가."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ resize: 'vertical', minHeight: 200, lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="v0-btn-2" onClick={() => { update({ ...state, draft: { title, body } }); showToast('임시 저장'); }}>임시 저장</button>
              <button className="v0-btn-2" onClick={requestReview}>검수 큐로</button>
              <button className="v0-btn-warn" onClick={() => openSignup('발행 신청')}>발행 (가입 필요)</button>
            </div>
          </div>
        </div>

        <aside className="v0-card" style={{ display: 'flex', flexDirection: 'column', gap: 14, height: 'fit-content' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AI 비율
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={aiRatio}
                onChange={(e) => setAiRatio(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{aiRatio}%</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>권장 40~60%. 사례·판례는 본인.</div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              검증 점수
            </div>
            {[
              { name: 'SEO', val: 78, cls: '#10B981' },
              { name: 'AI 탐지', val: 42, cls: '#F59E0B' },
              { name: '변협', val: 92, cls: '#10B981' },
            ].map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0' }}>
                <span style={{ minWidth: 50, color: 'var(--text-2)' }}>{s.name}</span>
                <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: s.cls, width: `${s.val}%` }} />
                </div>
                <span style={{ minWidth: 24, fontWeight: 500 }}>{s.val}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              발행 체크리스트
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              <div>○ 사례 1개 이상</div>
              <div>○ 판례 번호 명시</div>
              <div>● SEO &gt; 70</div>
              <div>○ AI 탐지 &lt; 30</div>
              <div>● 변협 통과</div>
            </div>
          </div>

          <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 'var(--r)', padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--warn-fg)', marginBottom: 6, lineHeight: 1.5 }}>
              시간 부족하면 이작가에게 위임. 건당 5~30만.
            </div>
            <button className="v0-btn-warn" style={{ width: '100%' }} onClick={() => openSignup('이작가 위임')}>위임 신청</button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
