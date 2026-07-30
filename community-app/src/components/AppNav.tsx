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
      className={`text-sm font-medium transition pb-3 -mb-3 border-b-2 ${
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
}: {
  href: string
  label: string
  icon: 'home' | 'barbell' | 'trophy'
}) {
  const pathname = usePathname()
  const active = isPathActive(pathname, href)
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
    >
      <TabIcon name={icon} className={active ? 'text-orange-500' : 'text-zinc-500'} />
      <span className={`text-[10px] font-semibold ${active ? 'text-orange-500' : 'text-zinc-500'}`}>
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
  notifications,
  fullName,
  avatarUrl,
}: {
  isAdmin: boolean
  isApproved: boolean
  hasLowTicket: boolean
  showPrograms: boolean
  notifications: Notification[]
  fullName: string | null
  avatarUrl: string | null
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { sessionActive } = useSessionActive()
  const showWorkouts = hasLowTicket || isAdmin
  // Low-ticket members now get a self-guided, day-drip version of the
  // lesson content on learn.getfitaf.fitness/dashboard.html (see
  // supabase-migration-community-spaces.sql's space_memberships and
  // dashboard.html's isLowTicketOnly/unlockedDay) - no longer just
  // "coming soon" for this membership tier.
  const showLessons = isAdmin || isApproved || hasLowTicket
  // Drives what someone without Lessons/Workouts access sees in their
  // place, below - plain "opens August 1" text before launch (not
  // clickable, so nobody can jump the gate early via a nav link), a
  // "join to unlock" link straight to /beta/pay once the beta is
  // actually live. Same date beta/page.tsx itself switches on.
  const isLive = isBetaLive()

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
              {showLessons ? (
                <ExternalNavLink
                  href="https://learn.getfitaf.fitness/dashboard.html"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition pb-3 -mb-3 border-b-2 border-transparent"
                  loadingLabel="Taking you to your lessons..."
                >
                  Go to your lessons
                </ExternalNavLink>
              ) : isLive ? (
                <Link
                  href="/beta/pay"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition inline-flex items-center gap-1.5 pb-3 -mb-3 border-b-2 border-transparent"
                >
                  <LockIcon className="text-orange-500" />
                  Join to unlock your lessons
                </Link>
              ) : (
                <span className="text-sm font-medium text-zinc-600" title="Daily lessons open August 1">
                  Daily lessons - opens August 1
                </span>
              )}
              {showWorkouts ? (
                <NavLink href="/workouts">Workouts</NavLink>
              ) : isLive ? (
                <Link
                  href="/beta/pay"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition inline-flex items-center gap-1.5 pb-3 -mb-3 border-b-2 border-transparent"
                >
                  <LockIcon className="text-orange-500" />
                  Join to unlock your workouts
                </Link>
              ) : (
                <span className="text-sm font-medium text-zinc-600" title="Workouts open August 1">
                  Workouts - opens August 1
                </span>
              )}
            </nav>
            <div className="w-px h-5 bg-zinc-800" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <NotificationBell initialNotifications={notifications} />
              <ProfileMenu
                fullName={fullName}
                avatarUrl={avatarUrl}
                isAdmin={isAdmin}
                showPrograms={showPrograms}
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
          <BottomTab href="/feed" label="Feed" icon="home" />
          {showWorkouts ? (
            <BottomTab href="/workouts" label="Workouts" icon="barbell" />
          ) : isLive ? (
            <Link href="/beta/pay" className="flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="barbell" className="text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-500">Join</span>
            </Link>
          ) : (
            <div className="flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="barbell" className="text-zinc-700" />
              <span className="text-[10px] font-semibold text-zinc-700">Workouts</span>
            </div>
          )}
          <BottomTab href="/leaderboard" label="Ranks" icon="trophy" />
          {showLessons ? (
            <a
              href="https://learn.getfitaf.fitness/dashboard.html"
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
            >
              <TabIcon name="book" className="text-zinc-500" />
              <span className="text-[10px] font-semibold text-zinc-500">Lessons</span>
            </a>
          ) : isLive ? (
            <Link href="/beta/pay" className="flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="book" className="text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-500">Join</span>
            </Link>
          ) : (
            <div className="flex-1 flex flex-col items-center gap-0.5 py-1.5">
              <TabIcon name="book" className="text-zinc-700" />
              <span className="text-[10px] font-semibold text-zinc-700">Lessons</span>
            </div>
          )}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5"
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
