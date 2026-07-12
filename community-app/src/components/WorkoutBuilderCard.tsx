import ExternalNavLink from './ExternalNavLink'

// Persistent, non-intrusive reminder that sits at the top of the feed
// (above posts/announcements) for any low-ticket member who hasn't
// built a workout yet. Unlike WorkoutBuilderPromptModal (which shows
// once, ever, then dismisses itself permanently), this has no dismiss
// state at all — it's gated purely by the same server-side
// hasBuiltWorkout check the popup uses, so it just quietly stays put
// on every visit without needing to interrupt anything. Disappears for
// good the moment a workout's actually been built.
export default function WorkoutBuilderCard({ href }: { href: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5 sm:p-6">
      <p className="text-white font-semibold mb-1">Your workout plan is ready to build</p>
      <p className="text-zinc-400 text-sm mb-4">
        Answer a few quick questions about your goals and equipment, and get a full plan built
        for you in minutes.
      </p>
      <ExternalNavLink
        href={href}
        className="inline-block bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        loadingLabel="Taking you to the workout builder..."
      >
        Build My Workout
      </ExternalNavLink>
    </div>
  )
}
