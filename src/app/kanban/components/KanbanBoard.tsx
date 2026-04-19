'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { canMove } from '@/lib/transitions';
import type {
  Client,
  Case,
  KanbanColumn as ColumnType,
  ColumnKey,
  TicketWithRelations,
  TeamMemberLite,
} from '@/lib/types';
import { KanbanColumn } from './KanbanColumn';
import { TicketCard } from './TicketCard';
import { NewTicketModal } from './NewTicketModal';
import { TicketDetailPanel } from './TicketDetailPanel';
import { moveTicket, approveTicket, rejectTicket } from '../actions';

export function KanbanBoard({
  columns,
  tickets: initialTickets,
  clients,
  cases,
  teamMembers,
}: {
  columns: ColumnType[];
  tickets: TicketWithRelations[];
  clients: Client[];
  cases: Case[];
  teamMembers: TeamMemberLite[];
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TicketWithRelations | null>(null);
  const [modalColumn, setModalColumn] = useState<ColumnKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 서버 revalidate 후 initialTickets가 바뀌면 동기화
  useMemo(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const byColumn = (key: ColumnKey) =>
    tickets
      .filter((t) => t.column_key === key)
      .sort((a, b) => a.order - b.order);

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;

    const ticketId = String(e.active.id);
    const toColumn = String(e.over.id) as ColumnKey;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.column_key === toColumn) return;

    if (!canMove(ticket.column_key, toColumn)) {
      setError(`${ticket.column_key} → ${toColumn} 이동 불가`);
      setTimeout(() => setError(null), 2500);
      return;
    }

    // Optimistic
    const prevColumn = ticket.column_key;
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, column_key: toColumn } : t)),
    );

    startTransition(async () => {
      try {
        await moveTicket(ticketId, toColumn, { skipRevalidate: true });
      } catch (err) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId ? { ...t, column_key: prevColumn } : t,
          ),
        );
        setError(err instanceof Error ? err.message : '이동 실패');
        setTimeout(() => setError(null), 2500);
      }
    });
  };

  const handleApprove = (t: TicketWithRelations) => {
    setTickets((prev) => prev.filter((x) => x.id !== t.id)); // optimistic: triage에서 제거
    startTransition(async () => {
      try {
        await approveTicket(t.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : '승인 실패');
      }
    });
  };

  const handleReject = (t: TicketWithRelations) => {
    if (!confirm('이 AI 제안을 기각할까요?')) return;
    setTickets((prev) => prev.filter((x) => x.id !== t.id));
    startTransition(async () => {
      try {
        await rejectTicket(t.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : '기각 실패');
      }
    });
  };

  // detail panel에서 선택된 티켓이 업데이트되도록 최신 데이터 참조
  const selectedFresh = selected ? tickets.find((t) => t.id === selected.id) ?? null : null;

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 bg-red-600 text-white text-sm px-4 py-2 rounded-md shadow-lg z-50">
          {error}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 min-w-max">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tickets={byColumn(col.key)}
              onTicketClick={(t) => setSelected(t)}
              onAddClick={() => setModalColumn(col.key)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTicket ? <TicketCard ticket={activeTicket} draggable={false} /> : null}
        </DragOverlay>
      </DndContext>

      {modalColumn && (
        <NewTicketModal
          open={true}
          onClose={() => setModalColumn(null)}
          defaultColumn={modalColumn}
          clients={clients}
          cases={cases}
        />
      )}

      <TicketDetailPanel
        ticket={selectedFresh}
        onClose={() => setSelected(null)}
        teamMembers={teamMembers}
      />
    </>
  );
}
