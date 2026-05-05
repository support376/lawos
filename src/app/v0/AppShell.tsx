'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useV0State } from './state';

export function AppShell({
  children,
  crumb,
}: {
  children: React.ReactNode;
  crumb: string;
}) {
  const { state, update, hydrated } = useV0State();
  const [signupAction, setSignupAction] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { action?: string };
      setSignupAction(detail?.action || '가입');
    }
    document.addEventListener('v0:signup', handler);
    document.addEventListener('v0:toast', (e) => {
      const detail = (e as CustomEvent).detail as { message?: string };
      if (detail?.message) {
        setToast(detail.message);
        setTimeout(() => setToast(null), 2500);
      }
    });
    return () => document.removeEventListener('v0:signup', handler);
  }, []);

  function completeSignup() {
    if (!signupAction) return;
    update({
      ...state,
      signedIn: true,
      requests: [...state.requests, { action: signupAction, at: Date.now() }],
    });
    setSignupAction(null);
    setEmail('');
    setToast(`가입 완료 — 신청: ${signupAction}`);
    setTimeout(() => setToast(null), 2500);
  }

  if (!hydrated) {
    return (
      <div className="v0-root">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>로딩...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="v0-root">
      <div className="v0-shell">
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="v0-topbar">
            <div className="v0-crumb">
              {state.currentSite.name} / {crumb}
            </div>
            <div
              onClick={() => setSignupAction('로그인')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 11px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span className={`v0-dot ${state.signedIn ? 'v0-d-ok' : 'v0-d-warn'}`} />
              <span>{state.signedIn ? '양변호사' : '비로그인'}</span>
            </div>
          </div>

          <main className="v0-main">
            {!state.signedIn && (
              <div className="v0-banner">
                <span>ℹ</span>
                <div>
                  <strong>비로그인 모드</strong> · 데이터는 브라우저에 임시 저장. 가입은 결과 영구 저장·사무장 활성화 시.
                </div>
                <button className="v0-banner-action" onClick={() => setSignupAction('결과 저장')}>
                  결과 저장
                </button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {signupAction && (
        <div className="v0-modal-bg" onClick={(e) => e.target === e.currentTarget && setSignupAction(null)}>
          <div className="v0-modal">
            <h3>{signupAction} — 가입</h3>
            <p>이메일 1줄로 즉시 시작. 데이터 영구 저장 + 사무장 활성화 + 매일 자동 추적.</p>
            <button className="v0-btn" onClick={completeSignup}>
              Google로 계속
            </button>
            <div className="v0-divider">또는</div>
            <input
              className="v0-input"
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="v0-btn" onClick={completeSignup} style={{ marginTop: 8 }}>
              이메일로 시작
            </button>
            <div className="v0-skip" onClick={() => setSignupAction(null)}>
              나중에 — 비로그인으로 계속
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '11px 20px',
            background: 'var(--text)',
            color: '#fff',
            borderRadius: 'var(--r)',
            fontSize: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            zIndex: 60,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export function openSignup(action: string) {
  document.dispatchEvent(new CustomEvent('v0:signup', { detail: { action } }));
}
export function showToast(message: string) {
  document.dispatchEvent(new CustomEvent('v0:toast', { detail: { message } }));
}
