// Shaped like the real /admin/videos page (add-video form, search bar,
// table rows) rather than a bare spinner, matching the skeleton
// convention already used elsewhere in admin.
export default function AdminVideosLoading() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
      <div className="h-5 w-40 rounded bg-zinc-800 mb-1" />
      <div className="h-3 w-96 rounded bg-zinc-800 mb-6" />

      <div className="glass rounded-2xl p-4 mb-4 h-40" />

      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="h-9 w-64 rounded-lg bg-zinc-800" />
        <div className="h-3 w-28 rounded bg-zinc-800" />
      </div>

      <div className="glass rounded-2xl divide-y divide-zinc-900">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12" />
        ))}
      </div>
    </div>
  )
}
