// Live UI piece for the /beta "What's included" section, replacing a
// screenshot that couldn't be sourced this round (see
// project_beta_launch_plan memory). Deliberately shows the real
// compose box's exact copy/styling rather than a fabricated sample
// post from a made-up member - there's no real presentable post to
// show yet (the only one live right now just says "Test"), and
// inventing a fake testimonial-style post would be misleading. Static,
// non-interactive - it's an illustration of the feature, not a
// functioning composer.
export default function BetaCommunityPreview() {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - the community feed</p>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5">
        <p className="text-zinc-500 text-xs">Share an update, win, or question with the group...</p>
      </div>
    </div>
  )
}
