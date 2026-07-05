import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "GetFit AF Community",
  description: "The GetFit AF client community",
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

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 font-sans">
        {user && (
          <header className="border-b border-gray-200 bg-white">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-sm">GetFit AF Community</span>
              <form action={signOut}>
                <button className="text-sm text-gray-500">Sign out</button>
              </form>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
