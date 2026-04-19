'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortalLink, sendPortalLinkEmail } from '@/app/actions/portal';

export function PortalModal({
  caseId,
  open,
  onClose,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLink(null);
      setError(null);
      setMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const generate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const l = await createPortalLink(caseId);
        setLink({ url: l.url, expiresAt: l.expiresAt });
      } catch (e) {
        setError(e instanceof Error ? e.message : '링크 생성 실패');
      }
    });
  };

  const sendEmail = () => {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await sendPortalLinkEmail(caseId);
        setLink({ url: r.url, expiresAt: '' });
        setMsg(
          r.mocked
            ? 'Mock 발송 (RESEND_API_KEY 미설정). 링크 수동 공유 가능.'
            : r.sent
              ? '✓ 고객 이메일로 발송 완료.'
              : `발송 실패: ${r.error}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : '발송 실패');
      }
    });
  };

  const copy = () => {
    if (link) {
      navigator.clipboard.writeText(link.url);
      setMsg('✓ 링크 복사됨.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl"
      >
        <div>
          <h3 className="font-semibold">🔗 고객 업로드 링크</h3>
          <p className="text-xs text-zinc-500 mt-1">
            14일 유효. 로그인 없이 고객이 서류 업로드 가능.
          </p>
        </div>

        {!link ? (
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={pending}
              className="flex-1 px-3 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
            >
              {pending ? '...' : '링크만 생성'}
            </button>
            <button
              onClick={sendEmail}
              disabled={pending}
              className="flex-1 px-3 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? '...' : '이메일 발송'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded break-all text-xs font-mono">
              {link.url}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copy}
                className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
              >
                링크 복사
              </button>
              <button
                onClick={sendEmail}
                disabled={pending}
                className="flex-1 px-3 py-2 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                이메일로 발송
              </button>
            </div>
          </div>
        )}

        {msg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{msg}</p>}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
            {error}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full text-xs text-zinc-500 pt-1"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
