import { MessageCircle } from 'lucide-react'
import Avatar from './Avatar'

// Live UI piece for the /beta "What's included" section, replacing a
// screenshot that couldn't be sourced this round (see
// project_beta_launch_plan memory). Satish's follow-up: the earlier
// empty compose-box version read as too generic - this shows an actual
// sample post instead, matching the real PostCard's visual structure
// (avatar, name, timestamp, caption, like/comment row). The member and
// caption are illustrative placeholders, not a real post - there isn't
// a presentable real one yet (the only live post right now just says
// "Test") - so this is clearly a sample of the feature, not a claimed
// real testimonial. Fully static, no interactivity, since this is an
// unauthenticated public page.
export default function BetaCommunityPreview() {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/40">
      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <Avatar avatarUrl={null} name="Arjun" size={32} />
          <div>
            <p className="text-[13px] font-semibold text-white">Arjun</p>
            <p className="text-[11px] text-zinc-500">2 days ago</p>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
          Finished today&apos;s Upper Body session 💪 That last round of push-ups wrecked me but got through it.
          Feeling stronger already.
        </p>
      </div>
      <div className="px-3 pb-3 pt-1 border-t border-zinc-900 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" stroke="none">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          4
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />2
        </span>
      </div>
    </div>
  )
}
