// Shaped like the real /lessons page (back link, title, tab row, lesson
// cards) rather than a bare spinner - same convention as feed/workouts/
// leaderboard/profile/admin's own loading.tsx files, so there's no layout
// jump once the real content replaces it.
//
// This route had none at all until now: it only became reachable from
// AppNav's client-side nav (Link/BottomTab, both driven by usePathname)
// once low-ticket members started routing here instead of out to
// learn.getfitaf.fitness - before that it had no in-app entry point that
// would trigger this kind of loading state. Without a loading.tsx, App
// Router leaves the previous page on screen with zero feedback (not even
// the nav tab highlighting, since that's tied to the same pathname
// transition) until this page's server-side data fetch - lessons,
// progress, leaderboard, submissions, all fetched together - finishes,
// which read as an unresponsive click.
export default function LessonsLoading() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-4 w-36 rounded bg-zinc-800 mb-4" />

      <div className="mb-6">
        <div className="h-5 w-40 rounded bg-zinc-800 mb-2" />
        <div className="h-3 w-72 rounded bg-zinc-800" />
      </div>

      <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-3 overflow-hidden">
        <div className="h-4 w-16 rounded bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-800" />
        <div className="h-4 w-20 rounded bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-800" />
        <div className="h-4 w-24 rounded bg-zinc-800" />
      </div>

      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-zinc-800" />
              <div className="h-2.5 w-1/3 rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
