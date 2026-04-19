'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  TICKET_TYPE_ICON,
  PRIORITY_COLOR,
  CASE_TYPE_LABEL,
  type TicketWithRelations,
} from '@/lib/types';
import { AIBadge } from '@/components/AIBadge';

function dueLabel(due: string | null) {
  if (!due) return null;
  const diff = differenceInCalendarDays(parseISO(due), new Date());
  if (diff < 0) return { text: `${Math.abs(diff)}일 지남`, className: 'text-red-600 font-medium' };
  if (diff === 0) return { text: '오늘', className: 'text-amber-600 font-medium' };
  if (diff <= 3) return { text: `D-${diff}`, className: 'text-amber-600' };
  return { text: `D-${diff}`, className: 'text-zinc-500' };
}

export function TicketCard({
  ticket,
  onClick,
  draggable = true,
}: {
  ticket: TicketWithRelations;
  onClick?: () => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
  });

  const due = dueLabel(ticket.due_date);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Drag가 아닌 클릭일 때만 detail
        if (!isDragging) onClick?.();
      }}
      className={`bg-white dark:bg-zinc-800 rounded-md border-l-4 ${PRIORITY_COLOR[ticket.priority]} border border-zinc-200 dark:border-zinc-700 p-3 mb-2 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug">{ticket.title}</h3>
        <span className="text-base shrink-0" title={ticket.type}>
          {TICKET_TYPE_ICON[ticket.type]}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
        {ticket.client && <span className="truncate max-w-[8rem]">{ticket.client.name}</span>}
        {ticket.case?.case_type && (
          <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded">
            {CASE_TYPE_LABEL[ticket.case.case_type]}
          </span>
        )}
        {due && <span className={due.className}>{due.text}</span>}
        {ticket.waiting_on && (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded">
            대기: {ticket.waiting_on === 'client' ? '고객' : ticket.waiting_on === 'court' ? '법원' : '상대'}
          </span>
        )}
        {ticket.ai_suggested && (
          <AIBadge
            confidence={ticket.ai_confidence as number | null | undefined}
            compact
          />
        )}
        {ticket.assigned_to && <span title="담당자 있음">👤</span>}
      </div>
    </div>
  );
}
