'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { grantRole, revokeRole, type WorkspaceRoleEntry } from '@/app/actions/workspace-roles';
import { ROLE_KEYS, ROLE_LABEL, type Role } from '@/lib/ontology/core/roles';
import type { DomainKey } from '@/lib/auth/my-roles';

const DOMAINS: Array<{ key: DomainKey; label: string }> = [
  { key: '*', label: '전사' },
  { key: 'personal_rehab', label: '개인회생' },
  { key: 'divorce', label: '이혼' },
  { key: 'criminal', label: '형사' },
  { key: 'other', label: '기타' },
];

export function RoleMatrix({
  userId,
  userName,
  entries,
  canEdit,
}: {
  userId: string;
  userName: string;
  entries: WorkspaceRoleEntry[];
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const myEntries = entries.filter((e) => e.user_id === userId);
  const has = (domain: DomainKey, role: Role) =>
    myEntries.some((e) => e.domain === domain && e.role === role);

  const toggle = (domain: DomainKey, role: Role) => {
    setError(null);
    startTransition(async () => {
      const fn = has(domain, role) ? revokeRole : grantRole;
      const r = await fn({ userId, domain, role });
      if (!r.ok) setError(r.error ?? '실패');
      else router.refresh();
    });
  };

  const summary = myEntries
    .map((e) => `${DOMAINS.find((d) => d.key === e.domain)?.label}·${ROLE_LABEL[e.role]}`)
    .join(', ');

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500 truncate flex-1">
          {myEntries.length === 0 ? (
            <span className="text-amber-600 dark:text-amber-400">⚠ 역할 없음 — 워크플로우 접근 불가</span>
          ) : (
            summary
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700"
          >
            {expanded ? '접기' : '편집'}
          </button>
        )}
      </div>

      {expanded && canEdit && (
        <div className="mt-3 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 text-zinc-500 font-normal">역할 \ 도메인</th>
                {DOMAINS.map((d) => (
                  <th key={d.key} className="px-2 py-1 text-zinc-500 font-normal">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_KEYS.map((role) => (
                <tr key={role} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1 whitespace-nowrap">{ROLE_LABEL[role]}</td>
                  {DOMAINS.map((d) => {
                    // managing_partner는 '*'만 허용 (도메인별 대표 없음)
                    const applicable = role === 'managing_partner' ? d.key === '*' : true;
                    const active = has(d.key, role);
                    return (
                      <td key={d.key} className="px-2 py-1 text-center">
                        {applicable ? (
                          <button
                            onClick={() => toggle(d.key, role)}
                            disabled={pending}
                            className={`w-5 h-5 rounded border disabled:opacity-40 ${
                              active
                                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                                : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                            title={`${userName} → ${d.label} · ${ROLE_LABEL[role]}`}
                          >
                            {active ? '✓' : ''}
                          </button>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">
            * 대표변호사는 전사(*) 단일 — 체크 즉시 반영. 마지막 대표는 해제 불가.
          </p>
        </div>
      )}
    </div>
  );
}
