import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import NotificationBell from "@/components/NotificationBell";
import ExternalNavLink from "@/components/ExternalNavLink";
import { createWorkoutBuilderHandoffUrl } from "@/lib/workoutBuilderHandoff";
import type { Notification } from "@/types";

export const metadata: Metadata = {
  title: "GetFit AF Community",
  description: "The GetFit AF client community",
};

export const viewport: Viewport = {
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let isApproved = false;
  let hasLowTicket = false;
  let notifications: Notification[] = [];
  if (user) {
    const [profileRes, membershipRes, notificationsRes] = await Promise.all([
      supabase.from("profiles").select("is_admin, approved").eq("id", user.id).single(),
      supabase
        .from("space_memberships")
        .select("space")
        .eq("profile_id", user.id)
        .eq("space", "low_ticket")
        .maybeSingle(),
      supabase
        .from("notifications")
        .select(
          "id, type, post_id, comment_id, read, created_at, actor:profiles!notifications_actor_id_fkey(id, full_name, avatar_url)"
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    isAdmin = !!profileRes.data?.is_admin;
    isApproved = !!profileRes.data?.approved;
    hasLowTicket = !!membershipRes.data;
    notifications = (notificationsRes.data as unknown as Notification[] | null) || [];
  }

  // Generated fresh on every page load so it's never stale by the
  // time someone clicks it (5-minute expiry, see workoutBuilderHandoff.ts).
  const workoutBuilderUrl =
    user?.email && (hasLowTicket || isAdmin) ? createWorkoutBuilderHandoffUrl(user.email) : null;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] font-sans">
        {user && (
          <header className="border-b border-zinc-800 bg-[#0a0a0a]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <Link
                href="/feed"
                className="font-black text-base tracking-tight text-white hover:opacity-80 transition"
              >
                GET<span className="text-orange-500">FIT</span> AF
                <span className="ml-1.5 font-medium text-zinc-400">Community</span>
              </Link>
              <div className="flex items-center gap-4">
                <NotificationBell initialNotifications={notifications} />
                {/* next/link, not a plain <a> — a plain anchor here
                    triggers a full browser reload instead of Next's
                    client-side transition, which is exactly why
                    loading.tsx never got a chance to show for these. */}
                <Link
                  href="/leaderboard"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/profile"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition"
                >
                  Edit Profile
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium text-zinc-400 hover:text-white transition"
                  >
                    Admin
                  </Link>
                )}
                {isAdmin || isApproved ? (
                  <ExternalNavLink
                    href="https://learn.getfitaf.fitness/dashboard.html"
                    className="text-sm font-medium text-orange-500 hover:text-orange-400 transition"
                    loadingLabel="Taking you to your lessons..."
                  >
                    Go to your lessons
                  </ExternalNavLink>
                ) : (
                  // Daily lessons aren't open to the low-ticket space yet -
                  // shown as plain text (not a link) so nobody clicks
                  // through to a page that'll just look broken for them.
                  <span className="text-sm font-medium text-zinc-600" title="Daily lessons for this membership are on the way">
                    Daily lessons - coming soon
                  </span>
                )}
                {workoutBuilderUrl && (
                  <ExternalNavLink
                    href={workoutBuilderUrl}
                    className="text-sm font-medium text-orange-500 hover:text-orange-400 transition"
                    loadingLabel="Taking you to the workout builder..."
                  >
                    Build My Workout
                  </ExternalNavLink>
                )}
                {(hasLowTicket || isAdmin) && (
                  // Internal route (next/link, not ExternalNavLink) -
                  // /workouts itself handles the "no plan built yet"
                  // case gracefully, so this is always shown rather
                  // than needing the same existence check the feed's
                  // card/popup do.
                  <Link
                    href="/workouts"
                    className="text-sm font-medium text-zinc-400 hover:text-white transition"
                  >
                    Workouts
                  </Link>
                )}
                <form action={signOut}>
                  <button className="text-sm font-medium text-zinc-400 hover:text-white transition">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
