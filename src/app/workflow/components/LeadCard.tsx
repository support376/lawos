'use client';

import { useState } from 'react';
import type { Lead } from '@/lib/ontology/core/objects';
import { LEAD_SOURCE_LABEL } from '@/lib/ontology/core/objects';
import { LeadDetailModal } from './LeadDetailModal';

function daysSince(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return '오늘';
  if (d === 1) return '어제';
  return `D+${d}`;
}

export function LeadCard({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);

  const urgencyColor =
    lead.urgency === 'high'
      ? 'border-l-red-500'
      : lead.urgency === 'low'
        ? 'border-l-zinc-300'
        : 'border-l-amber-400';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full text-left bg-white dark:bg-zinc-800 rounded p-2 border-l-2 ${urgencyColor} shadow-sm hover:shadow-md transition`}
      >
        <div className="text-xs font-medium truncate">{lead.name}</div>
        {lead.contact && (
          <div className="text-[10px] text-zinc-500 truncate">{lead.contact}</div>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-500">
          {lead.source && (
            <span className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded">
              {LEAD_SOURCE_LABEL[lead.source]}
            </span>
          )}
          <span>· {daysSince(lead.last_contact_at ?? lead.first_contact_at)}</span>
        </div>
      </button>
      {open && <LeadDetailModal lead={lead} onClose={() => setOpen(false)} />}
    </>
  );
}
