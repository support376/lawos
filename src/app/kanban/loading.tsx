export default function KanbanLoading() {
  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 bg-white dark:bg-zinc-900 h-14 shrink-0" />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" />
        <main className="flex-1 p-6">
          <div className="flex gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-72 h-64 rounded-lg bg-zinc-100 dark:bg-zinc-900 animate-pulse"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
