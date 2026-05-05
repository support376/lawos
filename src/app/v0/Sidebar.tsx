'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { exportData, resetData, useV0State } from './state';

const NAV_ITEMS = [
  {
    href: '/v0/dashboard',
    label: '대시보드',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    href: '/v0/diagnose',
    label: '사이트 진단',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: '/v0/adcheck',
    label: '변협 검증',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    href: '/v0/writer',
    label: '콘텐츠',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </svg>
    ),
  },
  {
    href: '/v0/agents',
    label: '사무장',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { state, update } = useV0State();
  const [siteOpen, setSiteOpen] = useState(false);

  return (
    <aside className="v0-sidebar">
      <div className="v0-brand">
        <div className="v0-logo">L</div>
        <div className="v0-brand-name">LawOS</div>
      </div>

      <div className="v0-site" onClick={() => setSiteOpen((v) => !v)} style={{ position: 'relative' }}>
        <span className="v0-site-name">{state.currentSite.domain}</span>
        <svg style={{ width: 12, height: 12, color: 'var(--text-3)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
        {siteOpen && (
          <div
            style={{
              position: 'absolute',
              top: 38,
              left: 0,
              right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              padding: 6,
              zIndex: 5,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {state.sites.map((s) => (
              <div
                key={s.domain}
                style={{ padding: '8px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}
                onClick={() => {
                  update({ ...state, currentSite: s });
                  setSiteOpen(false);
                }}
              >
                <strong>{s.name}</strong>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.domain}</div>
              </div>
            ))}
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--text-2)',
                borderTop: '1px solid var(--border)',
                marginTop: 4,
                paddingTop: 10,
              }}
              onClick={() => {
                setSiteOpen(false);
                document.dispatchEvent(new CustomEvent('v0:signup', { detail: { action: '새 사이트 추가' } }));
              }}
            >
              + 새 사이트 추가
            </div>
          </div>
        )}
      </div>

      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={`v0-nav ${pathname === item.href ? 'active' : ''}`}>
          {item.icon}
          {item.label}
        </Link>
      ))}

      <div className="v0-section">누적 자산</div>
      <div className="v0-tag">키워드 <span>{state.keywords.length}/5</span></div>
      <div className="v0-tag">채널 <span>{state.channels.length}개</span></div>
      <div className="v0-tag">작성 <span>{state.contents.length}건</span></div>
      <div className="v0-tag">신청 <span>{state.requests.length}건</span></div>

      <div style={{ marginTop: 'auto', padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <button className="v0-btn-2" onClick={() => exportData(state)} style={{ flex: 1 }} title="JSON 내보내기">
          ⤓ 내보내기
        </button>
        <button className="v0-btn-2" onClick={resetData} title="초기화">⟲</button>
      </div>
    </aside>
  );
}
