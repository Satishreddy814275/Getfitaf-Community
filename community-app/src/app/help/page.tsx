import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Step1Visual,
  Step2Visual,
  Step3Visual,
  Step4Visual,
  FeedVisual,
  ProgramsVisual,
  WorkoutsVisual,
  LessonsVisual,
  GuidelinesVisual,
  LeaderboardVisual,
  ProfileVisual,
} from '@/components/HelpVisuals'

// Permanent explainer page for members and anyone new who signs up -
// content matches the approved help-page-draft.md copy exactly. Same
// "permanent version of a first-time popup" pattern as /guidelines:
// HelpBanner links here once (RulesGate child, shown once ever), and
// this stays reachable from the ProfileMenu nav anytime after.
//
// Each step/section also carries a real recreation of the actual
// screen it's describing (see HelpVisuals.tsx) - these are the same
// annotated frames reviewed and refined in help-page-visual-draft.html
// before this page was first built; that pass only ported the text,
// this pass adds the visuals it was missing.
export const dynamic = 'force-dynamic'

const DAILY_RHYTHM = [
  {
    title: 'Pick your program.',
    body: `New to training, or coming back after a long break? Start with Foundations, it's built for exactly that: two weeks, beginner level, minimal equipment, nothing to figure out on day one. Once you're comfortable, use "Browse other programs" to switch to one that fits your goals and equipment better.`,
    visual: <Step1Visual />,
  },
  {
    title: "Read today's lesson.",
    body: "A new lesson unlocks each day under Lessons. They're short by design, usually five to ten minutes, and build on each other, so it's worth going in order.",
    visual: <Step2Visual />,
  },
  {
    title: 'Log your workout.',
    body: 'Open your program for the day, follow the plan, and mark your sets as you go.',
    visual: <Step3Visual />,
  },
  {
    title: 'Ask in the community.',
    body: 'Stuck on a lesson, unsure about a swap, or just want to share a win? Post it in the community feed.',
    visual: <Step4Visual />,
  },
]

const SECTIONS = [
  {
    name: 'Feed.',
    body: "The community's shared space. Post updates, ask questions, and see what other members are working through.",
    visual: <FeedVisual />,
  },
  {
    name: 'Programs.',
    body: 'Your workout plans, organized by goal and equipment. Pick one program to follow at a time.',
    visual: <ProgramsVisual />,
  },
  {
    name: 'Workouts.',
    body: "Where you log each day's session, one set at a time. Your history lives here too.",
    visual: <WorkoutsVisual />,
  },
  {
    name: 'Lessons.',
    body: "A new short lesson each day covering training, nutrition, mindset, and recovery. They unlock one at a time, so everyone's working through the same material together.",
    visual: <LessonsVisual />,
  },
  {
    name: 'Community guidelines.',
    body: 'The few ground rules for this space. Worth a read once.',
    visual: <GuidelinesVisual />,
  },
  {
    name: 'Leaderboard.',
    body: "A friendly view of who's been most active in the community over the last 30 days.",
    visual: <LeaderboardVisual />,
  },
  {
    name: 'Profile.',
    body: 'Your account details, progress, and where you manage or cancel your membership.',
    visual: <ProfileVisual />,
  },
]

const FAQ = [
  {
    q: 'Can I switch programs?',
    a: "Yes, anytime. Go to Programs and pick a different one. If you're partway through your current program, you'll see a quick confirmation before switching.",
  },
  {
    q: "Why can't I see all the lessons at once?",
    a: "Lessons unlock one per day starting from when you join. This is intentional. It keeps the pace realistic and means you're never staring at forty lessons wondering where to start.",
  },
  {
    q: 'What if I fall behind on lessons?',
    a: "No pressure. Unlocked lessons stay available, so you can catch up whenever you have time. There's no penalty for going at your own pace.",
  },
  {
    q: 'How do I cancel my membership?',
    a: "Go to your Profile and use the cancel option there. You'll keep access through the end of your current billing period, and you won't be charged again after that.",
  },
  {
    q: "Where do I ask a question if I'm stuck?",
    a: "Post it in the community feed. That's the fastest way to hear back, whether from another member or from the team.",
  },
]

export default async function HelpPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <h1 className="text-white text-xl font-bold mb-1">How this works</h1>
      <p className="text-zinc-500 text-sm mb-6">
        A quick guide to getting the most out of your membership. Come back here anytime you need a
        refresher.
      </p>

      <div className="glass rounded-2xl p-5 mb-5">
        <p className="text-white text-sm font-semibold mb-1">Your daily rhythm</p>
        <p className="text-zinc-400 text-sm leading-relaxed mb-5">
          This is the one thing to remember: pick a program, follow the day&apos;s lesson, log your
          workout, and post in the community if you have a question.
        </p>
        <ol className="space-y-6">
          {DAILY_RHYTHM.map((step, i) => (
            <li key={i}>
              <p className="text-white text-sm font-semibold mb-1">
                {i + 1}. {step.title}
              </p>
              <p className="text-zinc-400 text-sm leading-relaxed mb-3">{step.body}</p>
              {step.visual}
            </li>
          ))}
        </ol>
      </div>

      <div className="glass rounded-2xl p-5 mb-5">
        <p className="text-white text-sm font-semibold mb-1">What each section does</p>
        <p className="text-zinc-500 text-xs mb-4">Reference views for anytime you need a refresher.</p>
        <div className="space-y-5">
          {SECTIONS.map((section, i) => (
            <div key={i}>
              <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                <span className="text-white font-semibold">{section.name}</span> {section.body}
              </p>
              {section.visual}
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <p className="text-white text-sm font-semibold mb-4">Frequently asked questions</p>
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <div key={i}>
              <p className="text-white text-sm font-semibold mb-1">{item.q}</p>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
