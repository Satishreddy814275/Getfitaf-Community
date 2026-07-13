import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Applied once here at the root layout - cascades to every page in the
// app (feed, workouts, premium/low_ticket community spaces, admin
// dashboard) since they all share this one layout. Self-hosted by
// Next.js (no external request at runtime, no layout shift). Replaces
// the plain Arial/Helvetica fallback that was in globals.css before -
// this was never a deliberate font choice, just the browser default.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
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
    <html lang="en" className={`h-full antialiased ${manrope.variable}`}>
      <body className="min-h-full flex flex-col bg-[#0a0a0a] font-sans">
        {user && (
          <AppNav
            isAdmin={isAdmin}
            isApproved={isApproved}
            hasLowTicket={hasLowTicket}
            workoutBuilderUrl={workoutBuilderUrl}
            notifications={notifications}
          />
        )}
        {/* Bottom padding on mobile only, clearing the fixed bottom tab
            bar in AppNav (~64px + safe-area inset) so page content
            never sits underneath it. Not needed on desktop, where
            there's no fixed bottom bar. */}
        <div className={user ? 'pb-16 sm:pb-0' : ''}>{children}</div>
      </body>
    </html>
  );
}
