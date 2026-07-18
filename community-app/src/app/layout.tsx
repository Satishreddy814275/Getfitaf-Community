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
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SplashScreen from "@/components/SplashScreen";
import type { Notification } from "@/types";

export const metadata: Metadata = {
  title: "GetFit AF Community",
  description: "The GetFit AF client community",
  // manifest.json + icons make this installable as a PWA. appleWebApp
  // is what actually gets Safari's "Add to Home Screen" to treat it as
  // a standalone app (own icon, no browser chrome) instead of just a
  // bookmark - Android/Chrome would pick most of this up from the
  // manifest alone, but iOS needs these explicit tags too.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GetFit AF",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#f97316",
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

  // Program picker is an internal route now (see /programs and
  // migration-program-templates.sql) - no signed handoff token needed,
  // just the same access gate the external builder link used to have.
  const showPrograms = hasLowTicket || isAdmin;

  return (
    <html lang="en" className={`h-full antialiased ${manrope.variable}`}>
      <body className="min-h-full flex flex-col bg-[#0a0a0a] font-sans">
        <SplashScreen />
        <ServiceWorkerRegister />
        {user && (
          <AppNav
            isAdmin={isAdmin}
            isApproved={isApproved}
            hasLowTicket={hasLowTicket}
            showPrograms={showPrograms}
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
