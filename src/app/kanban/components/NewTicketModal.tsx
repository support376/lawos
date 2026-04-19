'use client';

import { useState, useTransition } from 'react';
import { createTicket, createCase } from '../actions';
import type { Client, Case, ColumnKey, CaseType, TicketType, Priority } from '@/lib/types';
import { TICKET_TYPE_LABEL, CASE_TYPE_LABEL } from '@/lib/types';
import { NewClientModal } from './NewClientModal';

export function NewTicketModal({
  open,
  onClose,
  defaultColumn,
  clients,
  cases,
}: {
  open: boolean;
  onClose: () => void;
  defaultColumn: ColumnKey;
  clients: Client[];
  cases: Case[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const [caseId, setCaseId] = useState<string>('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseType, setNewCaseType] = useState<CaseType>('personal_rehab');

  const clientCases = cases.filter((c) => c.client_id === clientId);

  if (!open) return null;

  const reset = () => {
    setClientId('');
    setCaseId('');
    setShowNewCase(false);
    setNewCaseTitle('');
    setError(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        let finalCaseId = caseId || null;
        // 새 사건 만들기 on-the-fly
        if (showNewCase && clientId && newCaseTitle.trim()) {
          const caseFd = new FormData();
          caseFd.set('client_id', clientId);
          caseFd.set('title', newCaseTitle);
          caseFd.set('case_type', newCaseType);
          const newCase = await createCase(caseFd);
          finalCaseId = newCase.id;
        }

        await createTicket({
          title: String(fd.get('title') ?? ''),
          description: (fd.get('description') as string) || null,
          type: fd.get('type') as TicketType,
          priority: Number(fd.get('priority') ?? 2) as Priority,
          due_date: (fd.get('due_date') as string) || null,
          column_key: defaultColumn,
          client_id: clientId || null,
          case_id: finalCaseId,
        });

        reset();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장 실패');
      }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
        onClick={onClose}
      >
        <form
          onSubmit={onSubmit}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-lg p-6 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">새 티켓</h2>
            <span className="text-xs text-zinc-500">컬럼: {defaultColumn}</span>
          </div>

          <input
            name="title"
            required
            autoFocus
            placeholder="제목 *"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
          />

          {/* 고객 선택 */}
          <div className="flex gap-2">
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setCaseId('');
              }}
              className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="">고객 없음</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewClient(true)}
              className="px-3 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              + 새 고객
            </button>
          </div>

          {/* 사건 선택 (고객 있을 때만) */}
          {clientId && !showNewCase && (
            <div className="flex gap-2">
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              >
                <option value="">사건 없음</option>
                {clientCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewCase(true)}
                className="px-3 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                + 새 사건
              </button>
            </div>
          )}

          {clientId && showNewCase && (
            <div className="p-3 border border-zinc-200 dark:border-zinc-700 rounded-md space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">새 사건</span>
                <button
                  type="button"
                  onClick={() => setShowNewCase(false)}
                  className="text-xs text-zinc-500 underline"
                >
                  기존 선택
                </button>
              </div>
              <input
                value={newCaseTitle}
                onChange={(e) => setNewCaseTitle(e.target.value)}
                placeholder="사건명"
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <select
                value={newCaseType}
                onChange={(e) => setNewCaseType(e.target.value as CaseType)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              >
                {(Object.keys(CASE_TYPE_LABEL) as CaseType[]).map((k) => (
                  <option key={k} value={k}>
                    {CASE_TYPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 타입 + 우선순위 */}
          <div className="grid grid-cols-2 gap-2">
            <select
              name="type"
              defaultValue="promise"
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              {(Object.keys(TICKET_TYPE_LABEL) as TicketType[]).map((k) => (
                <option key={k} value={k}>
                  {TICKET_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              name="priority"
              defaultValue="2"
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="1">P1 긴급</option>
              <option value="2">P2 높음</option>
              <option value="3">P3 보통</option>
              <option value="4">P4 낮음</option>
            </select>
          </div>

          <input
            type="date"
            name="due_date"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          />

          <textarea
            name="description"
            placeholder="설명 (선택)"
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>

      <NewClientModal
        open={showNewClient}
        onClose={() => setShowNewClient(false)}
        onCreated={(c) => setClientId(c.id)}
      />
    </>
  );
}
