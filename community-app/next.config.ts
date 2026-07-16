import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
