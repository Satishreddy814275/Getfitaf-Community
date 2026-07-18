import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sw.js has to be fetched fresh (or at least revalidated) every time
  // for the "update available" prompt in ServiceWorkerRegister.tsx to
  // ever fire - without this, Vercel/the CDN could keep serving a
  // stale cached copy of the worker script itself, and a real code
  // update would never get detected client-side no matter how long
  // someone keeps the app open.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  images: {
    // Avatars and post media are all served from this project's Supabase
    // storage bucket (see NEXT_PUBLIC_SUPABASE_URL) - next/image needs
    // remote hosts explicitly allow-listed before it'll optimize them.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zxuuyzhbryelekousbsw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
