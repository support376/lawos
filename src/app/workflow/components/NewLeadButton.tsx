'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createLead } from '@/app/actions/leads';
import type { LeadSource, LeadUrgency } from '@/lib/ontology/core/objects';
import type { DomainKey } from '@/lib/auth/my-roles';

const SOURCE_OPTIONS: Array<{ v: LeadSource; l: string }> = [
  { v: 'phone', l: '전화' },
  { v: 'kakao_ads', l: '카톡광고' },
  { v: 'blog', l: '블로그' },
  { v: 'referral', l: '지인추천' },
  { v: 'walk_in', l: '방문' },
  { v: 'naver', l: '네이버' },
  { v: 'google', l: '구글' },
  { v: 'other', l: '기타' },
];

export function NewLeadButton({ domain }: { domain: DomainKey }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [source, setSource] = useState<LeadSource>('phone');
  const [urgency, setUrgency] = useState<LeadUrgency>('normal');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const caseTypeHint = domain === '*' ? 'undetermined' : domain;

  const close = () => {
    setOpen(false);
    setName('');
    setContact('');
    setSource('phone');
    setUrgency('normal');
    setNotes('');
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError('이름 필수');
    startTransition(async () => {
      const r = await createLead({
        name: name.trim(),
        contact: contact || null,
        source,
        urgency,
        case_type_hint: caseTypeHint,
        notes: notes || null,
      });
      if (!r.ok) setError(r.error ?? '생성 실패');
      else {
        close();
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        + 리드 등록
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
          onClick={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl"
          >
            <h2 className="text-sm font-semibold">새 리드 ({domain === '*' ? '도메인 미확정' : domain})</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 *"
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              autoFocus
            />
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="연락처"
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">유입채널</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource)}
                  className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">긴급도</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as LeadUrgency)}
                  className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                >
                  <option value="low">낮음</option>
                  <option value="normal">보통</option>
                  <option value="high">높음</option>
                </select>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="메모"
              rows={3}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                {pending ? '등록중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
