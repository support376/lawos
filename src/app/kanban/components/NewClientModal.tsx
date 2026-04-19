'use client';

import { useState, useTransition } from 'react';
import { createClientRecord } from '../actions';

export function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (client: { id: string; name: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const client = await createClientRecord(fd);
        onCreated?.(client);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장 실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-6 space-y-4 shadow-xl"
      >
        <h2 className="text-lg font-semibold">새 고객</h2>
        <input
          name="name"
          required
          autoFocus
          placeholder="이름 *"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        />
        <input
          name="phone"
          type="tel"
          placeholder="전화 (선택)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        />
        <input
          name="email"
          type="email"
          placeholder="이메일 (선택)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        />
        <textarea
          name="memo"
          placeholder="메모 (선택)"
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 resize-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
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
  );
}
