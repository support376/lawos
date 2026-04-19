'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCase } from '@/app/kanban/actions';
import { createClientRecord } from '@/app/kanban/actions';
import { CASE_TYPE_LABEL, type Client, type CaseType } from '@/lib/types';

export function NewCaseModal({
  open,
  onClose,
  clients,
  defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 고객: 기존 선택 or 새로 추가
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    defaultClientId ? 'existing' : clients.length > 0 ? 'existing' : 'new',
  );
  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  // 사건 필드
  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState<CaseType>('personal_rehab');
  const [caseNumber, setCaseNumber] = useState('');
  const [court, setCourt] = useState('');
  const [opposingParty, setOpposingParty] = useState('');
  const [retainerDate, setRetainerDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  if (!open) return null;

  const reset = () => {
    setClientMode(clients.length > 0 ? 'existing' : 'new');
    setClientId(defaultClientId ?? '');
    setNewClientName('');
    setNewClientPhone('');
    setNewClientEmail('');
    setTitle('');
    setCaseType('personal_rehab');
    setCaseNumber('');
    setCourt('');
    setOpposingParty('');
    setRetainerDate(new Date().toISOString().slice(0, 10));
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('사건명을 입력하세요');
      return;
    }

    startTransition(async () => {
      try {
        // 1) 신규 고객이면 먼저 생성
        let finalClientId = clientId;
        if (clientMode === 'new') {
          if (!newClientName.trim()) {
            setError('고객 이름을 입력하세요');
            return;
          }
          const fd = new FormData();
          fd.set('name', newClientName);
          if (newClientPhone) fd.set('phone', newClientPhone);
          if (newClientEmail) fd.set('email', newClientEmail);
          const created = await createClientRecord(fd);
          finalClientId = created.id;
        }

        if (!finalClientId) {
          setError('고객을 선택하거나 새로 추가하세요');
          return;
        }

        // 2) 사건 생성
        const fd = new FormData();
        fd.set('client_id', finalClientId);
        fd.set('title', trimmedTitle);
        fd.set('case_type', caseType);
        if (caseNumber) fd.set('case_number', caseNumber);
        if (court) fd.set('court', court);
        if (opposingParty) fd.set('opposing_party', opposingParty);
        if (retainerDate) fd.set('retainer_date', retainerDate);
        const c = await createCase(fd);

        close();
        router.push(`/cases/${c.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패');
      }
    });
  };

  const autoTitle = () => {
    if (clientMode === 'existing') {
      const c = clients.find((x) => x.id === clientId);
      return c ? `${c.name} ${CASE_TYPE_LABEL[caseType]}` : '';
    }
    return newClientName ? `${newClientName} ${CASE_TYPE_LABEL[caseType]}` : '';
  };

  return (
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
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div>
          <h2 className="text-lg font-semibold">새 사건</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            수임한 사건을 기록합니다. 저장 시 유형에 맞는 워크플로우가 자동 준비됩니다.
          </p>
        </div>

        {/* 고객 */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={clientMode === 'existing'}
                onChange={() => setClientMode('existing')}
                disabled={clients.length === 0}
              />
              기존 고객
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={clientMode === 'new'}
                onChange={() => setClientMode('new')}
              />
              새 고객
            </label>
          </div>

          {clientMode === 'existing' ? (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="">고객 선택...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-1.5">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="고객 이름 *"
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="전화"
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                />
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="이메일"
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* 사건 유형 */}
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
            사건 유형
          </label>
          <select
            value={caseType}
            onChange={(e) => setCaseType(e.target.value as CaseType)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          >
            {(Object.keys(CASE_TYPE_LABEL) as CaseType[]).map((k) => (
              <option key={k} value={k}>
                {CASE_TYPE_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500 mt-1">
            {caseType === 'personal_rehab' &&
              '워크플로우: 6 스테이지 / 20 서류 / 14 액션 자동 준비'}
            {caseType === 'divorce' &&
              '기본 템플릿 (상세 템플릿 추가 예정)'}
            {caseType === 'criminal' &&
              '기본 템플릿 (상세 템플릿 추가 예정)'}
            {caseType === 'other' && '분야 미지정 — 수동 관리'}
          </p>
        </div>

        {/* 사건명 */}
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
            사건명 *
          </label>
          <div className="flex gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={autoTitle() || '예: 김민수 개인회생'}
              required
              className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            {autoTitle() && !title && (
              <button
                type="button"
                onClick={() => setTitle(autoTitle())}
                className="px-2.5 py-2 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                자동
              </button>
            )}
          </div>
        </div>

        {/* 선택 메타 */}
        <details>
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100">
            추가 정보 (선택)
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="사건번호 (예: 2025개회12345)"
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            <input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="담당 법원"
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
            <input
              value={opposingParty}
              onChange={(e) => setOpposingParty(e.target.value)}
              placeholder="상대방"
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm col-span-2"
            />
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">수임일</label>
              <input
                type="date"
                value={retainerDate}
                onChange={(e) => setRetainerDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              />
            </div>
          </div>
        </details>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '생성 중...' : '사건 만들기'}
          </button>
        </div>
      </form>
    </div>
  );
}
