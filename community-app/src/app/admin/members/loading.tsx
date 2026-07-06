export default function AdminMembersLoading() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
      <div className="h-5 w-40 rounded bg-zinc-800 mb-1" />
      <div className="h-3 w-64 rounded bg-zinc-800 mb-6" />

      <div className="glass rounded-2xl divide-y divide-zinc-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-800" />
              <div className="h-3 w-32 rounded bg-zinc-800" />
            </div>
            <div className="h-6 w-20 rounded-lg bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
