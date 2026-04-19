export default function TodayLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 bg-white dark:bg-zinc-900 h-14" />
      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="h-8 w-40 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="space-y-1.5">
              {[0, 1].map((j) => (
                <div
                  key={j}
                  className="h-14 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
