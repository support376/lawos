'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClientRecord } from '@/app/actions/cases';

export function NewClientButton({
  variant = 'primary',
  label,
}: {
  variant?: 'primary' | 'secondary' | 'cta';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const className =
    variant === 'cta'
      ? 'px-6 py-3 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium shadow-sm'
      : variant === 'secondary'
        ? 'px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium'
        : 'px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium';

  const close = () => {
    setName('');
    setPhone('');
    setEmail('');
    setError(null);
    setOpen(false);
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError('이름 필수');
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('name', name);
        if (phone) fd.set('phone', phone);
        if (email) fd.set('email', email);
        const c = await createClientRecord(fd);
        close();
        router.push(`/clients/${c.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패');
      }
    });
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label ?? '+ 새 고객'}
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
          onClick={close}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-semibold">새 고객</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 *"
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화"
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">
                취소
              </button>
              <button type="submit" disabled={pending} className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50">
                {pending ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
