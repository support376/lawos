'use client';

import { useTransition } from 'react';
import { assignTicket, assignCase } from '@/app/actions/team';

export interface TeamOption {
  id: string;
  name: string | null;
  email: string;
}

export function AssigneeSelect({
  value,
  kind,
  entityId,
  members,
}: {
  value: string | null;
  kind: 'ticket' | 'case';
  entityId: string;
  members: TeamOption[];
}) {
  const [pending, startTransition] = useTransition();

  const onChange = (newValue: string) => {
    startTransition(async () => {
      const target = newValue || null;
      if (kind === 'ticket') await assignTicket(entityId, target);
      else await assignCase(entityId, target);
    });
  };

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 disabled:opacity-50"
    >
      <option value="">담당 없음</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name ?? m.email.split('@')[0]}
        </option>
      ))}
    </select>
  );
}
