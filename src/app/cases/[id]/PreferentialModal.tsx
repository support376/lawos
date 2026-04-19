'use client';

import { PreferentialAnalyzer } from './PreferentialAnalyzer';

export function PreferentialModal({
  caseId,
  open,
  onClose,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl mt-8"
      >
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="font-semibold">🔍 편파변제 탐지</h3>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              ✕
            </button>
          </div>
          <div className="p-1">
            <PreferentialAnalyzer caseId={caseId} />
          </div>
        </div>
      </div>
    </div>
  );
}
