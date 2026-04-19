'use client';

import { useState, useTransition } from 'react';
import { createPortalLink, sendPortalLinkEmail } from '@/app/actions/portal';

export function PortalButton({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const generate = () => {
    setError(null);
    setSentMsg(null);
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
    setSentMsg(null);
    startTransition(async () => {
      try {
        const r = await sendPortalLinkEmail(caseId);
        setLink({ url: r.url, expiresAt: '' });
        if (r.mocked) {
          setSentMsg('Mock 발송 (RESEND_API_KEY 미설정). 링크 수동 공유 가능.');
        } else if (r.sent) {
          setSentMsg('✓ 고객에게 이메일 발송 완료.');
        } else {
          setError(r.error ?? '발송 실패');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '발송 실패');
      }
    });
  };

  const copyLink = () => {
    if (link) {
      navigator.clipboard.writeText(link.url);
      setSentMsg('✓ 링크 복사됨. 카톡/문자로 공유 가능.');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        🔗 고객 업로드 링크
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="font-semibold">🔗 고객 업로드 링크</h3>
              <p className="text-xs text-zinc-500 mt-1">
                로그인 없이 고객이 서류를 업로드할 수 있는 14일 유효 링크.
              </p>
            </div>

            {!link ? (
              <div className="flex gap-2">
                <button
                  onClick={generate}
                  disabled={pending}
                  className="flex-1 px-3 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  {pending ? '생성 중...' : '링크 만 생성'}
                </button>
                <button
                  onClick={sendEmail}
                  disabled={pending}
                  className="flex-1 px-3 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
                >
                  {pending ? '발송 중...' : '이메일 발송'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded break-all text-xs font-mono">
                  {link.url}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    링크 복사
                  </button>
                  <button
                    onClick={sendEmail}
                    disabled={pending}
                    className="flex-1 px-3 py-2 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
                  >
                    이메일 발송
                  </button>
                </div>
              </div>
            )}

            {sentMsg && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{sentMsg}</p>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                {error}
              </p>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 pt-2"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
