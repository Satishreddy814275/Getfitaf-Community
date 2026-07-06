import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

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
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = !!profile?.is_admin;
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
