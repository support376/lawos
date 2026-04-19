'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  COLUMN_COLOR_CLASSES,
  type KanbanColumn as ColumnType,
  type TicketWithRelations,
} from '@/lib/types';
import { TicketCard } from './TicketCard';

export function KanbanColumn({
  column,
  tickets,
  onTicketClick,
  onAddClick,
  onApprove,
  onReject,
  isOver,
}: {
  column: ColumnType;
  tickets: TicketWithRelations[];
  onTicketClick: (t: TicketWithRelations) => void;
  onAddClick?: () => void;
  onApprove?: (t: TicketWithRelations) => void;
  onReject?: (t: TicketWithRelations) => void;
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: column.key });

  const isTriage = column.key === 'triage';

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-lg ${COLUMN_COLOR_CLASSES[column.color ?? 'gray']} p-3 flex flex-col ${isOver ? 'ring-2 ring-blue-400' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-sm">{column.name}</h2>
        <span className="text-xs text-zinc-500">{tickets.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[8rem] -mx-1 px-1">
        {isTriage && tickets.length === 0 && (
          <p className="text-xs text-zinc-500 px-2 py-4 leading-relaxed">
            여기에 AI가 감지한 할일 후보가 나타납니다. 현재는 수동으로 티켓을 만들 수 있어요.
          </p>
        )}

        {tickets.map((t) => (
          <div key={t.id}>
            <TicketCard ticket={t} onClick={() => onTicketClick(t)} />
            {isTriage && (
              <div className="flex gap-1 mb-2 -mt-1 px-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove?.(t);
                  }}
                  className="flex-1 text-xs py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded"
                >
                  승인
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject?.(t);
                  }}
                  className="flex-1 text-xs py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded"
                >
                  기각
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isTriage && (
        <button
          onClick={onAddClick}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded hover:bg-white/50 dark:hover:bg-zinc-800/50"
        >
          + 새 티켓
        </button>
      )}
    </div>
  );
}
