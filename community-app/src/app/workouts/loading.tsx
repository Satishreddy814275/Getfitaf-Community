// Shaped like the real /workouts page (tabs, progress bar, week cards)
// rather than a bare spinner, matching the skeleton convention already
// used by feed/leaderboard/profile/admin - so there's no layout jump
// once the real content replaces it. This was the specific page
// Satish flagged as having no click feedback at all.
export default function WorkoutsLoading() {
  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-5 w-40 rounded bg-zinc-800 mb-2" />
      <div className="h-3 w-64 rounded bg-zinc-800 mb-6" />

      <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-3">
        <div className="h-4 w-28 rounded bg-zinc-800" />
        <div className="h-4 w-32 rounded bg-zinc-800" />
      </div>

      <div className="h-1.5 w-full rounded-full bg-zinc-800 mb-5" />

      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4 space-y-2">
            <div className="h-4 w-20 rounded bg-zinc-800 mb-2" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-10 rounded-xl bg-zinc-900" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
