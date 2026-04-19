'use client';

import { useRef, useState } from 'react';

export function PortalUploader({ token }: { token: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('token', token);

      const res = await fetch('/api/portal/upload', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '업로드 실패' }));
        throw new Error(j.error ?? '업로드 실패');
      }

      setUploaded((prev) => [...prev, file.name]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 space-y-3">
      <h2 className="text-sm font-semibold">📤 파일 업로드</h2>
      <p className="text-xs text-zinc-500">
        PDF, 이미지, 워드, 엑셀 등 대부분 파일 지원. 최대 20MB. 개별 업로드.
      </p>

      <label className="block">
        <input
          ref={inputRef}
          type="file"
          onChange={onFile}
          disabled={uploading}
          className="block w-full text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-zinc-900 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900 file:cursor-pointer file:text-sm file:font-medium hover:file:bg-zinc-800 disabled:opacity-50"
        />
      </label>

      {uploading && (
        <p className="text-sm text-zinc-500">업로드 중...</p>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
          {error}
        </p>
      )}

      {uploaded.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1.5">
            ✓ 업로드 완료 ({uploaded.length})
          </div>
          <ul className="text-sm space-y-0.5">
            {uploaded.map((name, i) => (
              <li key={i} className="text-zinc-700 dark:text-zinc-300 truncate">
                📄 {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
