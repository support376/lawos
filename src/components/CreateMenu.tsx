'use client';

import { useEffect, useRef, useState } from 'react';
import type { Client, Case } from '@/lib/types';
import { NewCaseModal } from './NewCaseModal';
import { NewClientModal } from '@/app/kanban/components/NewClientModal';
import { CopilotModal } from '@/app/kanban/components/CopilotModal';
import { PasteAnalyzeModal } from '@/app/kanban/components/PasteAnalyzeModal';
import { BulkImportModal } from '@/app/kanban/components/BulkImportModal';

type MenuKey = null | 'new_case' | 'new_client' | 'copilot' | 'paste' | 'bulk';

export function CreateMenu({
  clients,
  cases,
}: {
  clients: Client[];
  cases: Case[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const items: Array<{
    key: Exclude<MenuKey, null>;
    icon: string;
    label: string;
    hint?: string;
    primary?: boolean;
  }> = [
    { key: 'new_case', icon: '📁', label: '새 사건', hint: '고객 + 분야 → 워크플로우 자동 준비', primary: true },
    { key: 'new_client', icon: '👤', label: '새 고객', hint: '이름/연락처' },
    { key: 'copilot', icon: '🎙', label: '상담 코파일럿', hint: '음성 녹음 → AI 할일 추출' },
    { key: 'paste', icon: '📋', label: '텍스트 분석', hint: '이메일/카톡 붙여넣기 → AI 추출' },
    { key: 'bulk', icon: '📦', label: '일괄 등록', hint: '기존 사건 자유 텍스트로 한 번에' },
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${
          open
            ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        }`}
      >
        <span>+</span>
        <span>만들기</span>
        <span className="text-xs opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-50 py-1.5">
          {items.map((it, i) => (
            <div key={it.key}>
              {i === 2 && (
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1.5 mx-2" />
              )}
              <button
                onClick={() => {
                  setActive(it.key);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded"
              >
                <span className="text-lg shrink-0 leading-none mt-0.5">
                  {it.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block text-sm ${
                      it.primary ? 'font-medium' : ''
                    }`}
                  >
                    {it.label}
                  </span>
                  {it.hint && (
                    <span className="block text-xs text-zinc-500 mt-0.5 truncate">
                      {it.hint}
                    </span>
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 각 모달 마운트 (한 번만 활성) */}
      <NewCaseModal
        open={active === 'new_case'}
        onClose={() => setActive(null)}
        clients={clients}
      />
      <NewClientModal
        open={active === 'new_client'}
        onClose={() => setActive(null)}
      />
      <CopilotModal
        open={active === 'copilot'}
        onClose={() => setActive(null)}
        clients={clients}
        cases={cases}
      />
      <PasteAnalyzeModal
        open={active === 'paste'}
        onClose={() => setActive(null)}
        clients={clients}
      />
      <BulkImportModal
        open={active === 'bulk'}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
