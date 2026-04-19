'use client';

export function CommandOpener() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('lawos:openCommand'));
      }}
      className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500"
      title="자연어 검색 (Ctrl+K)"
    >
      <span>🔍</span>
      <span>검색</span>
      <kbd className="ml-1 px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] font-mono">
        ⌘K
      </kbd>
    </button>
  );
}
