import type { ReactNode } from 'react'

// Real recreations of the app's own screens, annotated with what to
// click and why. This is the exact circle/arrow/highlight technique
// worked out and approved in the offline help-page-visual-draft.html
// review (alignment via outline/inset, never guessed pixel offsets),
// ported here as actual markup instead of a static mockup file - so it
// can't go stale as the real UI changes, and so /help actually shows
// what was built and reviewed, not just the copy. Pure presentational,
// no state or hooks, so this stays importable straight into the
// Server Component /help page.

function CommunityNavFull({ current }: { current: string }) {
  const links = [
    'Leaderboard',
    'Guidelines',
    'Edit Profile',
    'Go to your lessons',
    'Choose Your Program',
    'Workouts',
  ]
  return (
    <div className="bg-[#0a0a0a] border-b border-white/[0.08] px-5 py-3 flex items-center gap-4 text-xs flex-wrap">
      <span className="text-white font-extrabold text-[13px] mr-2">
        GET<span className="text-orange-500">FIT</span> AF Community
      </span>
      {links.map((label) => {
        if (label === current) {
          return (
            <span key={label} className="text-white">
              {label}
            </span>
          )
        }
        if (label === 'Go to your lessons') {
          return (
            <span key={label} className="relative pl-2.5 text-zinc-500">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-orange-400" />
              {label}
            </span>
          )
        }
        return (
          <span key={label} className="text-zinc-500">
            {label}
          </span>
        )
      })}
    </div>
  )
}

function CommunityNavSingle({ current }: { current: string }) {
  return (
    <div className="bg-[#0a0a0a] border-b border-white/[0.08] px-5 py-3 flex items-center gap-4 text-xs">
      <span className="text-white font-extrabold text-[13px] mr-2">
        GET<span className="text-orange-500">FIT</span> AF Community
      </span>
      <span className="text-white">{current}</span>
    </div>
  )
}

function PortalNav({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#0a0a0a] border-b border-white/[0.08] px-5 py-3 flex items-center gap-4 text-xs">
      <span className="text-white font-extrabold text-[13px] mr-2">
        GET<span className="text-orange-500">FIT</span> AF
      </span>
      {children}
    </div>
  )
}

function FrameShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden mb-3">{children}</div>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white/[0.03] border-l-[3px] border-orange-500 rounded-r-lg px-[18px] py-3 text-[13.5px] text-zinc-300 leading-relaxed">
      {children}
    </div>
  )
}

// --- Step 1: Pick your program ---
export function Step1Visual() {
  return (
    <>
      <FrameShell>
        <CommunityNavFull current="Choose Your Program" />
        <div className="p-5">
          <p className="text-zinc-500 text-xs mb-3.5">&larr; Back to Community</p>
          <h3 className="text-white text-[18px] font-bold mb-1.5">Choose Your Program</h3>
          <p className="text-zinc-500 text-xs mb-4">
            New here, or coming back after a break? Start with Foundations.
          </p>
          <div className="relative outline outline-2 outline-orange-500 outline-offset-[3px] shadow-[0_0_0_5px_rgba(249,115,22,0.15)] bg-white/[0.03] border border-orange-500/35 rounded-[10px] p-[18px]">
            <p className="mb-1">
              <span className="text-orange-500 text-[11px] font-bold tracking-wide">START HERE &middot;</span>{' '}
              <span className="text-white text-[15px] font-bold">Foundations</span>
            </p>
            <p className="text-zinc-500 text-[13px]">Beginner &middot; minimal equipment &middot; 2 weeks</p>
          </div>
          <div className="mt-3.5 bg-white/[0.03] border border-white/[0.08] rounded-[10px] px-[18px] py-3.5 text-zinc-300 text-[13px]">
            Browse other programs &#9662;
          </div>
        </div>
      </FrameShell>
      <Caption>
        <b className="text-white">What to look for:</b> click &quot;Choose Your Program&quot; in the nav to get here.
        If you&apos;re new to training or easing back in, Foundations is built for exactly that &mdash; two weeks,
        minimal equipment, nothing to figure out. Once you&apos;re comfortable, &quot;Browse other programs&quot;
        switches you to one that fits your goals and equipment better.
      </Caption>
    </>
  )
}

// --- Step 2: Read today's lesson ---
export function Step2Visual() {
  return (
    <>
      <FrameShell>
        <PortalNav>
          <span className="text-white">Satish Reddy</span>
          <span className="text-zinc-500">Community</span>
          <span className="text-zinc-500">Admin</span>
        </PortalNav>
        <div className="p-5">
          <p className="text-white text-[17px] mb-3.5">
            Hey, <span className="text-orange-500">Satish</span>
          </p>
          <div className="flex gap-2 mb-3.5 flex-wrap">
            <span className="bg-orange-500 text-[#1a1a1a] text-xs font-bold px-3.5 py-1.5 rounded-md">
              Week 1
            </span>
            <span className="text-zinc-500 text-xs px-1 py-1.5">Week 2</span>
            <span className="text-zinc-500 text-xs px-1 py-1.5">All Lessons</span>
          </div>
          <p className="text-zinc-500 text-[11px] tracking-wide mb-2.5">THIS WEEK&apos;S LESSONS</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-[10px] p-3.5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-orange-500 font-extrabold text-[15px]">Day 1</span>
                <span className="bg-purple-500/15 text-purple-300 text-[10.5px] font-bold px-2 py-0.5 rounded-full">
                  Mindset
                </span>
              </div>
              <p className="text-white text-[13px] font-bold mb-2.5">Growth Mindset vs Fixed Mindset</p>
              <span className="relative inline-block">
                <span className="bg-orange-500 text-[#1a1a1a] text-xs font-bold px-4 py-2 rounded-md inline-block">
                  Start &rarr;
                </span>
                <span className="absolute -inset-1.5 border-2 border-orange-500 rounded-[10px] pointer-events-none" />
              </span>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-[10px] p-3.5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-orange-500 font-extrabold text-[15px]">Day 2</span>
                <span className="bg-blue-500/15 text-blue-300 text-[10.5px] font-bold px-2 py-0.5 rounded-full">
                  Training
                </span>
              </div>
              <p className="text-white text-[13px] font-bold mb-2.5">The 3-Workout Rule</p>
              <span className="bg-orange-500 text-[#1a1a1a] text-xs font-bold px-4 py-2 rounded-md inline-block">
                Start &rarr;
              </span>
            </div>
          </div>
        </div>
      </FrameShell>
      <Caption>
        <b className="text-white">What to look for:</b> the circled Start button on today&apos;s card. Lessons
        unlock one per day and stay short on purpose &mdash; most are five to ten minutes.
      </Caption>
    </>
  )
}

// --- Step 3: Log your workout ---
export function Step3Visual() {
  return (
    <>
      <FrameShell>
        <div className="bg-[#0a0a0a] border-b border-white/[0.08] px-5 py-3 flex items-center gap-4 text-xs flex-wrap">
          <span className="text-white font-extrabold text-[13px] mr-2">
            GET<span className="text-orange-500">FIT</span> AF Community
          </span>
          <span className="text-zinc-500">Leaderboard</span>
          <span className="text-zinc-500">Guidelines</span>
          <span className="text-zinc-500">Edit Profile</span>
          <span className="relative pl-2.5 text-zinc-500">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-orange-400" />
            Go to your lessons
          </span>
          <span className="text-zinc-500">Choose Your Program</span>
          <span className="relative inline-block">
            <span className="text-white">Workouts</span>
            <span className="absolute -inset-1.5 border-2 border-orange-500 rounded-[10px] pointer-events-none" />
            <svg
              width="60"
              height="34"
              viewBox="0 0 60 34"
              className="absolute top-6 left-1/2 -translate-x-1/2 overflow-visible pointer-events-none"
            >
              <path d="M30,0 Q30,18 30,26" stroke="#F97316" strokeWidth={2.5} fill="none" markerEnd="url(#arrow3)" />
              <defs>
                <marker id="arrow3" markerWidth={8} markerHeight={8} refX={4} refY={6} orient="auto">
                  <path d="M0,0 L8,3 L0,6 Z" fill="#F97316" />
                </marker>
              </defs>
            </svg>
            <span className="absolute top-11 left-1/2 -translate-x-1/2 bg-orange-500 text-[#1a1a1a] text-[11px] font-extrabold px-2.5 py-1 rounded-md whitespace-nowrap">
              Click here
            </span>
          </span>
        </div>
        <div className="p-5">
          <h3 className="text-white text-[18px] font-bold mb-1">Your Workouts</h3>
          <p className="text-zinc-500 text-xs mb-3.5">
            Your 4-week program. Tap whatever&apos;s next, or pick any session out of order.
          </p>
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-[10px] overflow-hidden">
            <div className="relative outline outline-2 outline-orange-500 outline-offset-[3px] shadow-[0_0_0_5px_rgba(249,115,22,0.15)] bg-orange-500/[0.08] flex justify-between items-center px-3.5 py-2.5 text-[13px]">
              <span className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-orange-500 text-[#1a1a1a] text-[11px] font-extrabold flex items-center justify-center shadow-[0_0_0_3px_#0a0a0a] z-10">
                3
              </span>
              <span className="text-white">&#9675; Day 1: Upper Body BW 1</span>
              <span className="text-orange-400 font-bold">Up next</span>
            </div>
            <div className="flex justify-between items-center px-3.5 py-2.5 text-[13px] border-t border-white/[0.06]">
              <span className="text-zinc-300">&#9675; Day 2: Lower Body BW 1</span>
              <span className="text-zinc-500">&#9662;</span>
            </div>
            <div className="flex justify-between items-center px-3.5 py-2.5 text-[13px] border-t border-white/[0.06]">
              <span className="text-zinc-300">&#9675; Day 3: Cardio 1</span>
              <span className="text-zinc-500">&#9662;</span>
            </div>
          </div>
        </div>
      </FrameShell>
      <Caption>
        <b className="text-white">What to look for:</b> click &quot;Workouts&quot; in the nav, then tap the row marked
        &quot;Up next&quot; in orange to open the session and start logging sets.
      </Caption>
    </>
  )
}

// --- Step 4: Ask in the community ---
export function Step4Visual() {
  return (
    <>
      <FrameShell>
        <CommunityNavFull current="" />
        <div className="p-5">
          <div className="flex gap-2 mb-3.5">
            <span className="bg-orange-500 text-[#1a1a1a] text-xs font-bold px-3.5 py-1.5 rounded-md">
              Posts (1)
            </span>
            <span className="text-zinc-500 text-xs px-1 py-1.5">Announcements</span>
            <span className="text-zinc-500 text-xs px-1 py-1.5">Media</span>
          </div>
          <div className="relative outline outline-2 outline-orange-500 outline-offset-[3px] shadow-[0_0_0_5px_rgba(249,115,22,0.15)] bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3.5 text-zinc-500 text-[13px] mb-3.5">
            <span className="absolute -top-[11px] -right-[11px] w-[22px] h-[22px] rounded-full bg-orange-500 text-[#1a1a1a] text-[11px] font-extrabold flex items-center justify-center shadow-[0_0_0_3px_#0a0a0a] z-10">
              4
            </span>
            Share an update, win, or question with the group...
          </div>
          <div className="text-right">
            <span className="relative inline-block">
              <span className="absolute bottom-9 right-0 bg-orange-500 text-[#1a1a1a] text-[11px] font-extrabold px-2.5 py-1 rounded-md whitespace-nowrap">
                Click here to post
              </span>
              <svg
                width="60"
                height="30"
                viewBox="0 0 60 30"
                className="absolute bottom-2 right-2 overflow-visible pointer-events-none"
              >
                <path d="M45,0 Q45,14 40,22" stroke="#F97316" strokeWidth={2.5} fill="none" markerEnd="url(#arrow4)" />
                <defs>
                  <marker id="arrow4" markerWidth={8} markerHeight={8} refX={4} refY={6} orient="auto">
                    <path d="M0,0 L8,3 L0,6 Z" fill="#F97316" />
                  </marker>
                </defs>
              </svg>
              <span className="bg-orange-500 text-[#1a1a1a] text-xs font-bold px-4 py-2 rounded-md inline-block">
                Post
              </span>
              <span className="absolute -inset-1.5 border-2 border-orange-500 rounded-[10px] pointer-events-none" />
            </span>
          </div>
        </div>
      </FrameShell>
      <Caption>
        <b className="text-white">What to look for:</b> type in the open text box, then click Post. This is a
        community, not a solo app &mdash; questions and check-ins usually get a response within 48 hours.
      </Caption>
    </>
  )
}

// --- Section reference views ---
export function FeedVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Feed" />
      <div className="p-5">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3.5 text-zinc-500 text-[13px] mb-2.5">
          <span className="bg-orange-500/15 text-orange-400 text-[10.5px] font-bold px-2 py-0.5 rounded-full mr-2">
            Pinned
          </span>
          Welcome to the GetFit AF Community, start here
        </div>
        <p className="text-zinc-300 text-[12.5px]">
          The community&apos;s shared space. Post updates, ask questions, and see what other members are working
          through.
        </p>
      </div>
    </FrameShell>
  )
}

export function ProgramsVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Choose Your Program" />
      <div className="p-5">
        <p className="text-white text-sm font-bold mb-1.5">Bodyweight At Home: Upper/Lower + Cardio</p>
        <p className="text-zinc-500 text-[13px]">Beginner &middot; minimal equipment &middot; 4 weeks &middot; 0% complete</p>
      </div>
    </FrameShell>
  )
}

export function WorkoutsVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Workouts" />
      <div>
        <div className="flex justify-between items-center px-3.5 py-2.5 text-[13px] bg-orange-500/[0.08]">
          <span className="text-white">Day 1: Upper Body BW 1</span>
          <span className="text-orange-400 font-bold">Up next</span>
        </div>
        <div className="flex justify-between items-center px-3.5 py-2.5 text-[13px] border-t border-white/[0.06]">
          <span className="text-zinc-300">Day 2: Lower Body BW 1</span>
          <span className="text-zinc-500">&#9662;</span>
        </div>
      </div>
    </FrameShell>
  )
}

export function LessonsVisual() {
  return (
    <FrameShell>
      <PortalNav>
        <span className="text-white">Lessons</span>
      </PortalNav>
      <div className="p-5">
        <p className="text-zinc-500 text-[11px] tracking-wide mb-2">16 of 42 lessons completed</p>
        <div className="bg-white/5 rounded-full h-2 overflow-hidden">
          <div className="bg-orange-500 h-full" style={{ width: '38%' }} />
        </div>
      </div>
    </FrameShell>
  )
}

export function GuidelinesVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Guidelines" />
      <div className="p-5">
        <p className="text-white text-sm font-bold mb-1.5">1. Keep it respectful, always</p>
        <p className="text-zinc-500 text-[13px]">
          No putting down anyone, mocking, or judgment about anyone&apos;s starting point, body, pace, or results.
        </p>
      </div>
    </FrameShell>
  )
}

export function LeaderboardVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Leaderboard" />
      <div className="p-5">
        <p className="text-zinc-500 text-[13px]">
          Most active members over the last 30 days &mdash; posts and comments count.
        </p>
      </div>
    </FrameShell>
  )
}

export function ProfileVisual() {
  return (
    <FrameShell>
      <CommunityNavSingle current="Edit Profile" />
      <div className="p-5">
        <p className="text-white text-sm font-bold mb-1.5">Satish Reddy</p>
        <p className="text-zinc-500 text-[13px] mb-2.5">
          Update your name and photo. This is what the rest of the community sees.
        </p>
        <span className="border border-white/15 text-zinc-300 text-xs font-semibold px-3.5 py-[7px] rounded-md inline-block">
          Save changes
        </span>
      </div>
    </FrameShell>
  )
}
