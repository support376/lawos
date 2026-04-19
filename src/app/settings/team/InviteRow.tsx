'use client';

import { useState, useTransition } from 'react';
import { cancelInvite, resendInvite } from '@/app/actions/team';

interface Invite {
  id: string;
  email: string;
  role: string;
  invited_at: string; // 이미 포맷됨
  invited_by_user: { name: string | null; email: string } | null;
}

export function InviteRow({
  invite,
  canManage,
}: {
  invite: Invite;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onResend = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await resendInvite(invite.id);
        setMessage(r.mailSent ? '재발송 완료' : `실패: ${r.mailError}`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : '실패');
      }
    });
  };

  const onCancel = () => {
    if (!confirm('초대를 취소할까요?')) return;
    startTransition(() => cancelInvite(invite.id));
  };

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{invite.email}</div>
        <p className="text-xs text-zinc-500">
          {invite.role === 'admin' ? '관리자' : '멤버'} · {invite.invited_at}
          {invite.invited_by_user && ` · ${invite.invited_by_user.name ?? invite.invited_by_user.email}`}
        </p>
        {message && <p className="text-xs text-zinc-500 mt-1">{message}</p>}
      </div>
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onResend}
            disabled={pending}
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            재발송
          </button>
          <button
            onClick={onCancel}
            disabled={pending}
            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded disabled:opacity-50"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
