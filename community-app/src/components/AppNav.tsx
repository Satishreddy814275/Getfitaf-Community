'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NotificationBell from './NotificationBell'
import ProfileMenu from './ProfileMenu'
import ExternalNavLink from './ExternalNavLink'
import { signOut } from '@/app/login/actions'
import { useSessionActive } from './SessionActiveProvider'
import { isBetaLive } from '@/lib/betaLaunch'
import type { Notification } from '@/types'

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Desktop nav link - highlights white when its route (or a route
// nested under it, e.g. /admin/videos under /admin) is the current
// page, otherwise stays the same muted gray every other link uses.
// This is the fix for "no matter where you click, the top bar looks
// identical" - previously every Link here had the exact same static
// className regardless of the current URL.
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = isPathActive(pathname, href)
  return (
    <Link
      href={href}
      className={`block text-sm font-medium transition pb-3 -mb-3 border-b-2 ${
        active
          ? 'text-white border-orange-500'
          : 'text-zinc-400 hover:text-white border-transparent'
      }`}
    >
      {children}
    </Link>
  )
}

// Built from plain SVG primitives (rect/line/circle/polyline), not
// hand-drawn bezier paths - keeps these simple and reliable rather
// than risking a garbled icon from freehand path data.
function TabIcon({
  name,
  className,
}: {
  name: 'home' | 'barbell' | 'trophy' | 'book' | 'dots'
  className?: string
}) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }
  if (name === 'home') {
    return (
      <svg {...common}>
        <polyline points="4,11 12,4 20,11" />
        <rect x="6" y="11" width="12" height="9" rx="1" />
        <rect x="10" y="15" width="4" height="5" />
      </svg>
    )
  }
  if (name === 'barbell') {
    return (
      <svg {...common}>
        <line x1="6" y1="12" x2="18" y2="12" />
        <rect x="2" y="9.5" width="3" height="5" rx="1" />
        <rect x="19" y="9.5" width="3" height="5" rx="1" />
        <rect x="5.5" y="7.5" width="2.5" height="9" rx="1" />
        <rect x="16" y="7.5" width="2.5" height="9" rx="1" />
      </svg>
    )
  }
  if (name === 'trophy') {
    return (
      <svg {...common}>
        <rect x="8" y="3" width="8" height="8" rx="1" />
        <path d="M8 5H5.5a2 2 0 0 0 2.5 4" />
        <path d="M16 5h2.5a2 2 0 0 1-2.5 4" />
        <line x1="12" y1="11" x2="12" y2="15" />
        <rect x="9" y="15" width="6" height="2" rx="0.5" />
        <rect x="7.5" y="18" width="9" height="1.6" rx="0.5" />
      </svg>
    )
  }
  if (name === 'book') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="8" height="14" rx="1" />
        <rect x="13" y="5" width="8" height="14" rx="1" />
        <line x1="12" y1="5" x2="12" y2="19" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Small lock glyph for "you don't have access yet" links - orange (this
// genuinely is an upsell nudge, worth some visual weight) but paired with
// neutral link text rather than full solid orange, so it stays visually
// distinct from a real primary-action button like Post or Start.
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function BottomTab({
  href,
  label,
  icon,
  dataTour,
}: {
  href: string
  label: string
  icon: 'home' | 'barbell' | 'trophy' | 'book'
  dataTour?: string
}) {
  const pathname = usePathname()
  const active = isPathActive(pathname, href)
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5"
    >
      <TabIcon
        name={icon}
        className={`transition-colors duration-300 ${active ? 'text-orange-500' : 'text-zinc-500'}`}
      />
      <span
        className={`text-[10px] font-semibold transition-colors duration-300 ${active ? 'text-orange-500' : 'text-zinc-500'}`}
      >
        {label}
      </span>
    </Link>
  )
}

export default function AppNav({
  isAdmin,
  isApproved,
  hasLowTicket,
  showPrograms,
  showCoaching,
  notifications,
  fullName,
  avatarUrl,
}: {
  isAdmin: boolean
  isApproved: boolean
  hasLowTicket: boolean
  showPrograms: boolean
  showCoaching: boolean
  notifications: Notification[]
  fullName: string | null
  avatarUrl: string | null
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { sessionActive } = useSessionActive()
  const pathname = usePathname()
  const showWorkouts = hasLowTicket || isAdmin
  // Premium (isApproved) and admin keep the existing
  // learn.getfitaf.fitness experience, unchanged. Low-ticket-only members
  // go to /lessons instead - the in-app page built specifically because
  // learn.getfitaf.fitness (not itself a PWA) loaded slowly inside the
  // PWA wrapper. Premium wins if someone is somehow both approved and
  // has a low-ticket membership row, since they already have a working,
  // familiar lessons experience and don't need to be moved off it.
  const showPremiumLessons = isAdmin || isApproved
  const showLowTicketLessons = !showPremiumLessons && hasLowTicket
  const showLessons = showPremiumLessons || showLowTicketLessons
  // Drives what someone without Lessons/Workouts access sees in their
  // place, below - plain "opens August 1" text before launch (not
  // clickable, so nobody can jump the gate early via a nav link), a
  // "join to unlock" link straight to /beta/pay once the beta is
  // actually live. Same date beta/page.tsx itself switches on.
  const isLive = isBetaLive()
  // Drives the sliding highlight behind the mobile bottom tab bar - the
  // bar is always exactly 5 equal flex-1 columns (Feed, Workouts slot,
  // Ranks, Lessons slot, More) regardless of what's rendered in each
  // slot, so a single index cleanly maps to "which column to sit under."
  // null on any page outside these four routes (Profile/Admin/Guidelines,
  // reached via More) - there's no slot for the indicator to sit under
  // there, same as how none of the tabs highlight orange on those pages
  // today either.
  const activeTabIndex = isPathActive(pathname, '/feed')
    ? 0
    : showWorkouts && isPathActive(pathname, '/workouts')
      ? 1
      : isPathActive(pathname, '/leaderboard')
        ? 2
        : showLowTicketLessons && isPathActive(pathname, '/lessons')
          ? 3
          : null

  return (
    <>
      {/* Desktop - decluttered from a flat row of 8 equal-weight links
          down to: primary nav (things members reach for often) plus an
          avatar menu for everything else (Programs, Guidelines, Edit
          Profile, Admin, Sign out) - the exact same primary/secondary
          split the mobile bottom-tab bar + "More" sheet already use, just
          expressed as a dropdown instead of a bottom sheet. Sticky +
          backdrop-blur reuses the app's existing .glass language so the
          header reads as one continuous piece of that system rather than
          a flat opaque bar sitting on top of the page. */}
      <header className="hidden sm:block sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            href="/feed"
            className="font-black text-base tracking-tight text-white hover:opacity-80 transition"
          >
            GET<span className="text-orange-500">FIT</span> AF
            <span className="ml-1.5 font-medium text-zinc-400">Community</span>
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-5">
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              {/* Wrapping (rather than passing data-tour through as a
                  prop) keeps this working regardless of which of the
                  three branches renders, without touching NavLink/
                  ExternalNavLink's own prop surface. Note: only the span
                  itself gets auto-blockified by the flex container - the
                  link nested inside it does NOT, so it stays at its
                  default `display: inline` unless given an explicit
                  `block` class below. That mismatch (this link inline,
                  Leaderboard's own link auto-blockified to block as a
                  direct flex child) was causing a real 2px vertical
                  offset between Leaderboard and these two links -
                  confirmed via getBoundingClientRect. `block`/`flex`
                  here makes every state render as its own block box
                  regardless of nesting, so it can't recur. */}
              <span data-tour="lessons">
                {showPremiumLessons ? (
                  <ExternalNavLink
                    href="https://learn.getfitaf.fitness/dashboard.html"
                    className="block text-sm font-medium text-zinc-400 hover:text-white transition pb-3 -mb-3 border-b-2 border-transparent"
                    loadingLabel="Taking you to your lessons..."
                  >
                    Go to your lessons
                  </ExternalNavLink>
                ) : showLowTicketLessons ? (
                  <NavLink href="/lessons">Go to your lessons</NavLink>
                ) : isLive ? (
                  <Link
                    href="/beta/pay"
                    className="text-sm font-medium text-zinc-400 hover:text-white transition flex items-center gap-1.5 pb-3 -mb-3 border-b-2 border-transparent"
                  >
                    <LockIcon className="text-orange-500" />
                    Join to unlock your lessons
                  </Link>
                ) : (
                  <span className="block text-sm font-medium text-zinc-600" title="Daily lessons open August 1">
                    Daily lessons - opens August 1
                  </span>
                )}
              </span>
              <span data-tour="workouts">
                {showWorkouts ? (
                  <NavLink href="/workouts">Workouts</NavLink>
                ) : isLive ? (
                  <Link
                    href="/beta/pay"
                    className="text-sm font-medium text-zinc-400 hover:text-white transition flex items-center gap-1.5 pb-3 -mb-3 border-b-2 border-transparent"
                  >
                    <LockIcon className="text-orange-500" />
                    Join to unlock your workouts
                  </Link>
                ) : (
                  <span className="block text-sm font-medium text-zinc-600" title="Workouts open August 1">
                    Workouts - opens August 1
                  </span>
                )}
              </span>
            </nav>
            <div className="w-px h-5 bg-zinc-800" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <NotificationBell initialNotifications={notifications} />
              <ProfileMenu
                fullName={fullName}
                avatarUrl={avatarUrl}
                isAdmin={isAdmin}
                showPrograms={showPrograms}
                showCoaching={showCoaching}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile top bar - logo + notifications only. The rest of the
          nav moves to the bottom tab bar below, since that's the
          reachable-with-a-thumb pattern most fitness apps use. */}
      <header className="sm:hidden border-b border-zinc-800 bg-[#0a0a0a]">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link
            href="/feed"
            className="font-black text-base tracking-tight text-white hover:opacity-80 transition"
          >
            GET<span className="text-orange-500">FIT</span> AF
          </Link>
          <NotificationBell initialNotifications={notifications} />
        </div>
      </header>

      {/* Mobile bottom tab bar. Feed and Leaderboard always shown;
          Workouts/Lessons only when that member actually has access,
          so the bar never shows a tab that leads to a locked page.
          Everything else (Edit Profile, Admin, Choose Your Program, Sign
          out) lives behind "More" rather than crowding the bar.
          Hidden entirely while a workout session is active (sessionActive,
          reported up from WorkoutDayPicker via SessionActiveProvider) -
          same full-focus reasoning as hiding the page header above the
          workout itself: this bar sits right next to the exercise inputs
          on a phone screen, and a mis-tap here would navigate someone
          straight out of an in-progress set. */}
      {!sessionActive && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a] border-t border-zinc-800 flex pb-[env(safe-area-inset-bottom)]">
          {/* Sliding highlight behind the active tab. Plain absolute
              positioning with no z-index - default stacking paints
              positioned elements after non-positioned ones in DOM order,
              so each tab below gets `relative` (position:relative,
              z-index:auto) purely to make sure it still paints above
              this, not for its own layout. `fixed` on the nav above
              already establishes the containing block this measures
              top/left against, so it lines up with the tab row
              regardless of the safe-area padding below it.
              Two nested elements on purpose: the outer one is exactly
              20% wide (one column) so translateX(N * 100%) - which
              moves by 100% of the element's OWN width - lands it
              exactly on column N every time. The visible pill is the
              inner element, inset 6px on all sides of that column -
              keeping the inset separate from the step size is what
              keeps it from drifting off-center as N grows (an earlier
              version sized the pill itself to 20% - 6px and stepped by
              its own width, which undershot by 6px per tab). */}
          <div
            aria-hidden="true"
            className="absolute top-0 left-0 transition-transform duration-300 ease-out pointer-events-none"
            style={{
              // Bottom bound stops at the safe-area padding rather than
              // the nav's full box (bottom-0 would include that padding,
              // since it's part of the nav's own box height) - otherwise
              // on a notched phone running as an installed PWA (see
              // env(safe-area-inset-bottom) below on the nav itself)
              // this element - and the pill inset within it - stretches
              // down into that reserved zone, reading as oversized.
              bottom: 'env(safe-area-inset-bottom)',
              width: '20%',
              transform: `translateX(${(activeTabIndex ?? 0) * 100}%)`,
              opacity: activeTabIndex !== null ? 1 : 0,
            }}
          >
            <div
              className="absolute rounded-xl bg-orange-500/10"
              style={{ top: 6, bottom: 6, left: 10, right: 10 }}
            />
          </div>
          <BottomTab href="/feed" label="Feed" icon="home" />
          {showWorkouts ? (
            <BottomTab href="/workouts" label="Workouts" icon="barbell" dataTour="workouts" />
          ) : isLive ? (
            <Link href="/beta/pay" data-tour="workouts" className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="barbell" className="text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-500">Join</span>
            </Link>
          ) : (
            <div data-tour="workouts" className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="barbell" className="text-zinc-700" />
              <span className="text-[10px] font-semibold text-zinc-700">Workouts</span>
            </div>
          )}
          <BottomTab href="/leaderboard" label="Ranks" icon="trophy" />
          {showPremiumLessons ? (
            <a
              href="https://learn.getfitaf.fitness/dashboard.html"
              data-tour="lessons"
              className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5"
            >
              <TabIcon name="book" className="text-zinc-500" />
              <span className="text-[10px] font-semibold text-zinc-500">Lessons</span>
            </a>
          ) : showLowTicketLessons ? (
            <BottomTab href="/lessons" label="Lessons" icon="book" dataTour="lessons" />
          ) : isLive ? (
            <Link href="/beta/pay" data-tour="lessons" className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="book" className="text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-500">Join</span>
            </Link>
          ) : (
            <div data-tour="lessons" className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="book" className="text-zinc-700" />
              <span className="text-[10px] font-semibold text-zinc-700">Lessons</span>
            </div>
          )}
          <button
            onClick={() => setMoreOpen(true)}
            data-tour="avatar-menu"
            className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5"
          >
            <TabIcon name="dots" className="text-zinc-500" />
            <span className="text-[10px] font-semibold text-zinc-500">More</span>
          </button>
        </nav>
      )}

      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative bg-[#0a0a0a] border-t border-zinc-800 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1">
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />
            {showPrograms && (
              <Link
                href="/programs"
                onClick={() => setMoreOpen(false)}
                className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
              >
                Choose Your Program
              </Link>
            )}
            {!showLessons &&
              (isLive ? (
                <Link
                  href="/beta/pay"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2 w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
                >
                  <LockIcon className="text-orange-500" />
                  Join to unlock your lessons
                </Link>
              ) : (
                <p className="text-xs text-zinc-600 px-3 py-2">Daily lessons - opens August 1.</p>
              ))}
            <Link
              href="/help"
              onClick={() => setMoreOpen(false)}
              className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
            >
              Help
            </Link>
            {showCoaching && (
              <Link
                href="/coaching"
                onClick={() => setMoreOpen(false)}
                className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
              >
                One-on-one Coaching
              </Link>
            )}
            <Link
              href="/guidelines"
              onClick={() => setMoreOpen(false)}
              className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
            >
              Guidelines
            </Link>
            <Link
              href="/profile"
              onClick={() => setMoreOpen(false)}
              className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
            >
              Edit Profile
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMoreOpen(false)}
                className="block w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition"
              >
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button className="w-full text-left text-sm font-medium text-zinc-300 px-3 py-3 rounded-xl hover:bg-zinc-900/60 transition">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
