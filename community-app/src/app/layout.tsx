import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import NotificationBell from "@/components/NotificationBell";
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
  let notifications: Notification[] = [];
  if (user) {
    const [profileRes, notificationsRes] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
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
    notifications = (notificationsRes.data as unknown as Notification[] | null) || [];
  }

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
                <a
                  href="/leaderboard"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition"
                >
                  Leaderboard
                </a>
                <a
                  href="/profile"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition"
                >
                  Edit Profile
                </a>
                {isAdmin && (
                  <a
                    href="/admin"
                    className="text-sm font-medium text-zinc-400 hover:text-white transition"
                  >
                    Admin
                  </a>
                )}
                <a
                  href="https://learn.getfitaf.fitness/dashboard.html"
                  className="text-sm font-medium text-orange-500 hover:text-orange-400 transition"
                >
                  Go to your lessons
                </a>
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
