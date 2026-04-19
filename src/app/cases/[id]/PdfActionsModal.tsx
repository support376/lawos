'use client';

import { useState, useTransition } from 'react';
import {
  generateEngagementLetter,
  generateCreditorNotice,
} from '@/app/actions/pdf';

export function PdfActionsModal({
  caseId,
  which,
  onClose,
}: {
  caseId: string;
  which: 'engagement' | 'creditor' | null;
  onClose: () => void;
}) {
  if (!which) return null;
  return which === 'engagement' ? (
    <EngagementForm caseId={caseId} onClose={onClose} />
  ) : (
    <CreditorForm caseId={caseId} onClose={onClose} />
  );
}

function EngagementForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [fee, setFee] = useState('');
  const [scope, setScope] = useState('');
  const [address, setAddress] = useState('');
  const [firmName, setFirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await generateEngagementLetter({
          caseId,
          retainerFee: fee || null,
          scope: scope || null,
          clientAddress: address || null,
          lawFirmName: firmName || null,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : '생성 실패');
      }
    });
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
        <h3 className="font-semibold">📝 수임계약서 생성</h3>
        <input
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="법률사무소명 (예: OO 법률사무소)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="고객 주소 (선택)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="수임료 (예: 금 300만원 (부가세 별도))"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          placeholder="위임사무 범위 (비우면 기본)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '생성 중...' : 'PDF 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditorForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState('');
  const [address, setAddress] = useState('');
  const [body, setBody] = useState('');
  const [firmName, setFirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!recipient.trim()) {
      setError('채권자명 필수');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await generateCreditorNotice({
          caseId,
          recipientName: recipient,
          recipientAddress: address || null,
          bodyOverride: body.trim() || null,
          lawFirmName: firmName || null,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : '생성 실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-lg p-5 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h3 className="font-semibold">📮 내용증명 (개인회생 예정 통보)</h3>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="채권자명 (예: 주식회사 OO은행) *"
          required
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="채권자 주소 (선택)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <input
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="법률사무소명 (선택)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="본문 (비우면 기본 개인회생 예정 통보 템플릿)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none font-mono"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '생성 중...' : 'PDF 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
