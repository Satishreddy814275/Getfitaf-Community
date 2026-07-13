import Link from 'next/link'

// Persistent, non-intrusive reminder that sits at the top of the feed
// (above posts/announcements) for any low-ticket member who hasn't
// picked a program yet. Unlike WorkoutBuilderPromptModal (which shows
// once a day, then dismisses itself for the rest of it), this has no
// dismiss state at all — it's gated purely by the same server-side
// hasSelectedProgram check the popup uses, so it just quietly stays
// put on every visit without needing to interrupt anything. Disappears
// for good the moment a program's actually been picked. href now
// points at the internal /programs picker (see migration-program-
// templates.sql) rather than the external AI builder, so this uses a
// normal Link instead of ExternalNavLink.
export default function WorkoutBuilderCard({ href }: { href: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5 sm:p-6">
      <p className="text-white font-semibold mb-1">Choose your program to get started</p>
      <p className="text-zinc-400 text-sm mb-4">
        Pick the program that matches your level and equipment access - you can swap individual
        exercises later if something doesn&apos;t fit.
      </p>
      <Link
        href={href}
        className="inline-block bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        Choose Your Program
      </Link>
    </div>
  )
}
