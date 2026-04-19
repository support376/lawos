'use client';

import { useState, useTransition } from 'react';
import { inviteMember } from '@/app/actions/team';

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await inviteMember({ email, role });
        if (r.kind === 'added') {
          setMessage({ type: 'ok', text: '기존 가입자를 바로 멤버로 추가했습니다' });
        } else if (r.mailSent) {
          setMessage({ type: 'ok', text: `초대 이메일을 ${email}로 발송했습니다` });
        } else {
          setMessage({
            type: 'ok',
            text: `초대 기록은 저장됐지만 메일 발송 실패: ${r.mailError ?? '알 수 없음'}. 수동으로 가입 링크 공유하세요.`,
          });
        }
        setEmail('');
      } catch (err) {
        setMessage({
          type: 'err',
          text: err instanceof Error ? err.message : '초대 실패',
        });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
        className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
        className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
      >
        <option value="member">멤버</option>
        <option value="admin">관리자</option>
      </select>
      <button
        type="submit"
        disabled={pending || !email}
        className="px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
      >
        {pending ? '초대 중...' : '초대'}
      </button>
      {message && (
        <p
          className={`text-sm w-full ${
            message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
