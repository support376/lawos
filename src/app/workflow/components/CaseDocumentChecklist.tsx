'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDocumentStatus, type DocTypeDef, type CaseDocStatus } from '@/app/actions/case-documents';

const CATEGORY_LABEL: Record<string, string> = {
  application: '신청서류',
  identity: '신분 증빙',
  income: '소득 증빙',
  asset: '재산 증빙',
  debt: '채무 증빙',
  other: '기타',
};

type DocItem = DocTypeDef & CaseDocStatus;

export function CaseDocumentChecklist({
  caseId,
  items,
}: {
  caseId: string;
  items: DocItem[];
}) {
  const requiredItems = items.filter((d) => d.required);
  const optionalItems = items.filter((d) => !d.required);
  const requiredCollected = requiredItems.filter((d) => d.uploaded).length;
  const requiredVerified = requiredItems.filter((d) => d.verified).length;
  const requiredPct = requiredItems.length > 0 ? Math.round((requiredCollected / requiredItems.length) * 100) : 0;

  // 카테고리별 그룹
  const groups = new Map<string, DocItem[]>();
  for (const d of items) {
    const cat = d.category ?? 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(d);
  }

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold">📄 서류 체크리스트</h2>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">필수 수령</span>
            <div className="w-20 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
              <div
                className={`h-full ${requiredPct >= 90 ? 'bg-emerald-500' : requiredPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${requiredPct}%` }}
              />
            </div>
            <span className="tabular-nums text-zinc-500">{requiredCollected}/{requiredItems.length}</span>
          </div>
          <div className="text-zinc-500">
            검증 {requiredVerified}/{requiredCollected}
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {Array.from(groups.entries()).map(([cat, docs]) => (
          <div key={cat}>
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
              {CATEGORY_LABEL[cat] ?? cat}
            </div>
            <div className="space-y-1">
              {docs.map((d) => (
                <DocumentRow key={d.key} caseId={caseId} doc={d} />
              ))}
            </div>
          </div>
        ))}
        {optionalItems.length === 0 && requiredItems.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-4">
            이 도메인에 등록된 서류 정의 없음
          </p>
        )}
      </div>
    </section>
  );
}

function DocumentRow({ caseId, doc }: { caseId: string; doc: DocItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (field: 'uploaded' | 'verified') => {
    const next = !doc[field];
    startTransition(async () => {
      await setDocumentStatus({
        caseId,
        docTypeKey: doc.key,
        label: doc.label,
        required: doc.required,
        [field]: next,
      });
      router.refresh();
    });
  };

  const stateColor = doc.verified
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300'
    : doc.uploaded
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300'
      : doc.required
        ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border-red-200'
        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200';

  return (
    <div className={`flex items-center justify-between p-2 rounded border text-xs ${stateColor}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-medium truncate">
          {doc.label}
          {doc.required && <span className="ml-1 text-red-600">*</span>}
        </span>
        {doc.source && (
          <span className="text-[10px] opacity-70 shrink-0">
            · {doc.source === 'client' ? '의뢰인' : doc.source === 'public_record' ? '공공기록' : doc.source}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => toggle('uploaded')}
          disabled={pending}
          className={`text-[10px] px-2 py-0.5 rounded ${doc.uploaded ? 'bg-amber-600 text-white' : 'border border-current'} disabled:opacity-50`}
        >
          {doc.uploaded ? '✓ 수령' : '수령?'}
        </button>
        <button
          onClick={() => toggle('verified')}
          disabled={pending || !doc.uploaded}
          className={`text-[10px] px-2 py-0.5 rounded ${doc.verified ? 'bg-emerald-600 text-white' : 'border border-current'} disabled:opacity-30`}
        >
          {doc.verified ? '✓ 검증' : '검증?'}
        </button>
      </div>
    </div>
  );
}
