import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "GetFit AF Community",
  description: "GetFit AF's private client community - daily lessons, workouts, and a real coach-led group.",
};

// The bare homepage. Logged-in visitors go straight into the app,
// unchanged. Logged-out visitors used to be redirected straight to
// /login with no stop in between - a stranger with no account landing
// on a bare "Welcome back" sign-in form was the wrong first
// impression (Satish caught this 2026-08-03: someone given "the
// link" - the plain domain, not a tracked /beta campaign link - had
// nothing to orient them before hitting an auth wall).
//
// Deliberately its own small, static, logic-free page rather than
// just redirecting root to /beta: /beta is the real, actively-
// converting marketing/payment page every tracked link already points
// to, and Satish's explicit call was not to risk or entangle it with
// unrelated bare-domain traffic. This page does nothing but explain
// what GetFit AF Community is in one line and hand off to either
// /beta (join) or /login (sign back in) - see middleware.ts for the
// matching public-route allowlist entry this depends on.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/feed");

  return (
    <div className="min-h-full bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          GET<span className="text-orange-500">FIT</span> AF
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Client Community</p>
      </div>

      <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
        <p className="text-white text-lg font-bold mb-2">Sign in to see more</p>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">
          This is GetFit AF&apos;s private client community - daily lessons, self-guided
          workouts, and a real coach-led group. Join the beta to get access, or sign back in
          if you&apos;re already a member.
        </p>

        <div className="space-y-3">
          <Link
            href="/beta"
            className="block w-full bg-orange-500 hover:bg-orange-400 text-black font-bold py-3 rounded-xl transition text-sm"
          >
            Join the beta
          </Link>
          <Link
            href="/login"
            className="block w-full border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold py-3 rounded-xl transition text-sm"
          >
            Already have an account? Log in
          </Link>
        </div>

        {/* Deliberately lower-emphasis than the two buttons above - a
            plain text link, not a third button - so it doesn't compete
            with Join/Log in. Exists for exactly the case Satish named
            2026-08-03: someone who doesn't want to create an account or
            pay yet, but can still get real value (actual coach-shot
            form videos, no login required - see exercises/page.tsx). */}
        <Link
          href="/exercises"
          className="block mt-5 text-zinc-500 hover:text-orange-400 text-xs transition"
        >
          Just here to browse? See the exercise library →
        </Link>
      </div>
    </div>
  );
}
