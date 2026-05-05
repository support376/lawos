'use client';

import { useEffect, useState } from 'react';

const STATE_KEY = 'lawos_v0_state';

export type Keyword = { text: string; vol?: number; comp?: number; rank?: string; addedAt: number };
export type Channel = { type: string; url: string; status: 'ok' | 'warn' | 'stale' | 'off'; addedAt: number };
export type Content = { title: string; body: string; status: '아이디어' | '작성중' | '검토' | '발행' | '완료'; ai: number; createdAt: number };
export type Request = { action: string; at: number };
export type AdHistory = { text: string; result: string; score: number; at: string };
export type Site = { domain: string; name: string };

export type V0State = {
  signedIn: boolean;
  currentSite: Site;
  sites: Site[];
  keywords: Keyword[];
  channels: Channel[];
  contents: Content[];
  requests: Request[];
  adHistory: AdHistory[];
  draft: { title: string; body: string };
};

const defaultState: V0State = {
  signedIn: false,
  currentSite: { domain: 'welcome-law.kr', name: 'welcome 법률사무소' },
  sites: [
    { domain: 'welcome-law.kr', name: 'welcome 법률사무소' },
    { domain: 'kim-law.com', name: '김변호사 사무소' },
  ],
  keywords: [],
  channels: [],
  contents: [],
  requests: [],
  adHistory: [],
  draft: { title: '', body: '' },
};

export function useV0State() {
  const [state, setState] = useState<V0State>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState({ ...defaultState, ...parsed });
      }
    } catch {}
    setHydrated(true);
  }, []);

  const update = (next: V0State | ((prev: V0State) => V0State)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? (next as (p: V0State) => V0State)(prev) : next;
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(value));
      } catch {}
      return value;
    });
  };

  return { state, update, hydrated };
}

export function exportData(state: V0State) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lawos_data_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function resetData() {
  if (typeof window === 'undefined') return;
  if (!confirm('모든 로컬 데이터를 초기화합니다. 계속?')) return;
  localStorage.removeItem(STATE_KEY);
  location.reload();
}
