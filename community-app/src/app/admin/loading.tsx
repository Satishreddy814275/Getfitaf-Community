// Shown automatically by Next.js while /admin's data (posts, counts)
// is loading. Shaped like the real page so there's no layout jump once
// actual content replaces it.
export default function AdminLoading() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-5 w-56 rounded bg-zinc-800" />
          <div className="h-3 w-72 rounded bg-zinc-800" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-2xl p-5 h-20" />
        ))}
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-2xl p-4 h-28" />
        ))}
      </div>
    </div>
  )
}
