// Same reasoning as lessons/loading.tsx (missing entirely before, caused
// the same "click does nothing" feel) but shaped like this page instead -
// light #f2f2f2 background and white cards, not the app's usual dark
// theme, since that's what the real lesson page looks like. Also covers
// clicking a lesson from LessonSidebar's jump-to list or the prev/next
// links at the bottom of this same page, which hit this exact route.
export default function LessonLoading() {
  return (
    <div style={{ background: '#f2f2f2', minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto py-10 px-5 pb-16 flex flex-col lg:flex-row lg:items-start gap-6 animate-pulse">
        {/* Desktop sidebar skeleton - matches LessonSidebar's sticky card */}
        <aside className="hidden lg:block w-[260px] shrink-0">
          <div className="sticky top-[88px] bg-white rounded-lg shadow-sm p-4">
            <div className="h-3 w-24 rounded bg-black/[0.08] mb-2" />
            <div className="h-1.5 w-full rounded-full bg-black/[0.06] mb-3" />
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-black/[0.06] shrink-0" />
                  <div className="h-3 flex-1 rounded bg-black/[0.06]" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Mobile summary bar skeleton */}
        <div className="lg:hidden mb-6 w-full">
          <div className="w-full bg-white rounded-lg shadow-sm px-4 py-3 h-[52px]" />
        </div>

        <div className="max-w-[780px] w-full mx-auto lg:mx-0 min-w-0">
          <div className="h-4 w-40 rounded bg-black/[0.1] mb-6" />
          <div className="h-3 w-24 rounded bg-black/[0.1] mb-2.5" />

          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-20 rounded-full bg-black/[0.08]" />
            <div className="h-6 w-28 rounded-full bg-black/[0.08]" />
          </div>

          <div className="h-8 w-4/5 rounded bg-black/[0.1] mb-8" />

          <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm mb-6 space-y-3">
            <div className="h-3 w-full rounded bg-black/[0.06]" />
            <div className="h-3 w-full rounded bg-black/[0.06]" />
            <div className="h-3 w-5/6 rounded bg-black/[0.06]" />
            <div className="h-3 w-full rounded bg-black/[0.06]" />
            <div className="h-3 w-2/3 rounded bg-black/[0.06]" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 h-[52px] rounded-lg bg-white shadow-sm" />
            <div className="flex-1 h-[52px] rounded-lg bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}
