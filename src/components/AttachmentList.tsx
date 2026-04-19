'use client';

import { useRef, useState, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import {
  uploadAttachment,
  getAttachmentUrl,
  deleteAttachment,
  type AttachmentTarget,
} from '@/app/actions/attachments';

interface Attachment {
  id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export function AttachmentList({
  target,
  attachments,
}: {
  target: AttachmentTarget;
  attachments: Attachment[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    if (target.ticketId) fd.set('ticketId', target.ticketId);
    if (target.caseId) fd.set('caseId', target.caseId);
    if (target.eventId) fd.set('eventId', target.eventId);
    if (target.clientId) fd.set('clientId', target.clientId);

    startTransition(async () => {
      try {
        await uploadAttachment(fd);
        if (fileRef.current) fileRef.current.value = '';
      } catch (err) {
        setError(err instanceof Error ? err.message : '업로드 실패');
      }
    });
  };

  const onOpen = async (id: string) => {
    try {
      const url = await getAttachmentUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : '열기 실패');
    }
  };

  const onDelete = (id: string) => {
    if (!confirm('이 파일을 삭제할까요?')) return;
    startTransition(async () => {
      try {
        await deleteAttachment(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : '삭제 실패');
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          📎 첨부 파일 ({attachments.length})
        </span>
        <label className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
          {pending ? '업로드 중...' : '+ 업로드'}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={onUpload}
            disabled={pending}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded text-sm"
            >
              <span>{fileIcon(a.mime_type ?? a.original_name)}</span>
              <button
                onClick={() => onOpen(a.id)}
                className="flex-1 text-left truncate hover:underline"
              >
                {a.original_name}
              </button>
              <span className="text-xs text-zinc-500 shrink-0">
                {formatSize(a.size_bytes)}
              </span>
              <span className="text-xs text-zinc-500 shrink-0 hidden sm:inline">
                {format(parseISO(a.created_at), 'MM-dd')}
              </span>
              <button
                onClick={() => onDelete(a.id)}
                className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded px-1"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileIcon(mimeOrName: string): string {
  const s = mimeOrName.toLowerCase();
  if (s.includes('pdf')) return '📄';
  if (s.includes('image') || /\.(png|jpg|jpeg|gif|webp)$/.test(s)) return '🖼';
  if (s.includes('word') || /\.docx?$/.test(s)) return '📝';
  if (s.includes('sheet') || /\.xlsx?$/.test(s)) return '📊';
  if (s.includes('audio')) return '🎵';
  return '📎';
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
