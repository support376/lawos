'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createActionItem } from '@/app/actions/action-items';
import { ACTION_REGISTRY } from '@/lib/ontology/core/action-registry';
import { ROLE_LABEL, type Role } from '@/lib/ontology/core/roles';
import type { SubjectType } from '@/lib/ontology/core/objects';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

export function CreateActionButton({
  subjectType,
  subjectId,
  members,
}: {
  subjectType: SubjectType;
  subjectId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const availableSpecs = ACTION_REGISTRY.filter((a) => a.subject_types.includes(subjectType));

  const [actionType, setActionType] = useState(availableSpecs[0]?.key ?? '');
  const [title, setTitle] = useState('');
  const [teamRole, setTeamRole] = useState<Role | ''>('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(3);
  const [description, setDescription] = useState('');

  const currentSpec = availableSpecs.find((a) => a.key === actionType);

  const close = () => {
    setOpen(false);
    setActionType(availableSpecs[0]?.key ?? '');
    setTitle('');
    setTeamRole('');
    setAssignee('');
    setDueDate('');
    setPriority(3);
    setDescription('');
    setErr(null);
  };

  const submit = () => {
    setErr(null);
    if (!actionType) return setErr('Action 유형 선택');
    if (!title.trim()) return setErr('제목 필수');
    startTransition(async () => {
      const r = await createActionItem({
        subject_type: subjectType,
        subject_id: subjectId,
        action_type: actionType,
        title: title.trim(),
        description: description || null,
        assigned_to: assignee || null,
        team_role: teamRole || null,
        due_date: dueDate || null,
        priority,
      });
      if (!r.ok) return setErr(r.error ?? '실패');
      close();
      router.refresh();
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        + Action 생성
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={close}>
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <h3 className="text-base font-semibold">Action 생성</h3>

            <Field label="Action 유형 *">
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              >
                {availableSpecs.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
              {currentSpec?.description && (
                <p className="text-[10px] text-zinc-500 mt-0.5">{currentSpec.description}</p>
              )}
            </Field>

            <Field label="제목 *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={currentSpec?.label ?? ''}
                className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="담당 팀">
                <select
                  value={teamRole}
                  onChange={(e) => setTeamRole(e.target.value as Role | '')}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                >
                  <option value="">—</option>
                  {(currentSpec?.allowed_roles ?? []).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>

              <Field label="담당자">
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name ?? m.email.split('@')[0]}</option>
                  ))}
                </select>
              </Field>

              <Field label="마감">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
              </Field>

              <Field label="우선순위">
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3 | 4)}
                  className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                >
                  <option value={1}>P1 긴급</option>
                  <option value={2}>P2 중요</option>
                  <option value={3}>P3 보통</option>
                  <option value={4}>P4 낮음</option>
                </select>
              </Field>
            </div>

            <Field label="설명">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              />
            </Field>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700">
                취소
              </button>
              <button type="submit" disabled={pending} className="px-4 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50">
                {pending ? '생성중...' : '+ 생성'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}
