'use client';

import { useState, useTransition } from 'react';
import { removeMember, updateMemberRole } from '@/app/actions/team';
import { RoleMatrix } from './RoleMatrix';
import type { WorkspaceRoleEntry } from '@/app/actions/workspace-roles';

interface Member {
  role: 'owner' | 'admin' | 'member';
  user: { id: string; name: string | null; email: string; auth_provider: string | null };
}

export function MemberRow({
  member,
  myRole,
  currentUserId,
  roleLabel,
  allRoles,
  canEditRoles,
}: {
  member: Member;
  myRole: 'owner' | 'admin' | 'member';
  currentUserId: string;
  roleLabel: string;
  allRoles: WorkspaceRoleEntry[];
  canEditRoles: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isMe = member.user.id === currentUserId;
  const canManage =
    (myRole === 'owner' || myRole === 'admin') &&
    member.role !== 'owner' &&
    !isMe;

  const onRoleChange = (role: 'admin' | 'member') => {
    setError(null);
    startTransition(async () => {
      try {
        await updateMemberRole(member.user.id, role);
      } catch (e) {
        setError(e instanceof Error ? e.message : '변경 실패');
      }
    });
  };

  const onRemove = () => {
    if (!confirm(`${member.user.name ?? member.user.email}을(를) 제거할까요?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(member.user.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : '제거 실패');
      }
    });
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {member.user.name ?? member.user.email.split('@')[0]}
            </span>
            {isMe && <span className="text-xs text-zinc-500">(나)</span>}
            {member.user.auth_provider === 'google' && (
              <span className="text-xs text-zinc-500">· Google</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">{member.user.email}</p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManage ? (
            <select
              value={member.role}
              onChange={(e) => onRoleChange(e.target.value as 'admin' | 'member')}
              disabled={pending}
              className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            >
              <option value="member">멤버</option>
              <option value="admin">관리자</option>
            </select>
          ) : (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                member.role === 'owner'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400'
                  : member.role === 'admin'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {roleLabel}
            </span>
          )}
          {canManage && (
            <button
              onClick={onRemove}
              disabled={pending}
              className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded disabled:opacity-50"
            >
              제거
            </button>
          )}
        </div>
      </div>

      <RoleMatrix
        userId={member.user.id}
        userName={member.user.name ?? member.user.email.split('@')[0]}
        entries={allRoles}
        canEdit={canEditRoles}
      />
    </div>
  );
}
