// Next.js shows this automatically while /feed's server-side data
// fetch (posts, streak, leaderboard, etc.) is in flight — covers both
// normal navigation into the feed and the "click a notification, wait
// a beat" gap that previously had no feedback at all. Shaped like the
// real layout (tab bar + post cards + sidebar) rather than a bare
// spinner, so there's no layout jump once real content replaces it.
export default function FeedLoading() {
  return (
    <div className="max-w-6xl mx-auto w-full py-8 px-4 sm:px-6">
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-10 w-64 rounded-full bg-zinc-800 animate-pulse" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-zinc-800" />
                <div className="space-y-2">
                  <div className="h-3 w-32 rounded bg-zinc-800" />
                  <div className="h-2.5 w-20 rounded bg-zinc-800" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-zinc-800" />
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="glass rounded-2xl p-4 h-64 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
