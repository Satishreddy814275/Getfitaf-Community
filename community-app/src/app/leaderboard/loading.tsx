export default function LeaderboardLoading() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
      <div className="h-5 w-56 rounded bg-zinc-800 mb-1" />
      <div className="h-3 w-72 rounded bg-zinc-800 mb-6" />

      <div className="glass rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-6 w-6 rounded-full bg-zinc-800" />
            <div className="h-8 w-8 rounded-full bg-zinc-800" />
            <div className="h-3 w-40 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
