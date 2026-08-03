import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: '.getfitaf.fitness',
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    // /join is the low-ticket community's public landing page — has to
    // be reachable by people who don't have an account yet.
    request.nextUrl.pathname.startsWith('/join') ||
    // /api/beta-checkout is meant to work as a plain link clicked from
    // an acceptance email — possibly on a different device, or with an
    // expired browser session — so it can't depend on an active login.
    // It doesn't need the session at all: it only reads the `email`
    // query param to prefill Stripe checkout, same as it would for
    // anyone visiting cold.
    request.nextUrl.pathname.startsWith('/api/beta-checkout') ||
    // /api/stripe-webhook is called server-to-server by Stripe, never
    // by a browser - there's no session cookie to check and never will
    // be. Without this exclusion, every webhook delivery was getting
    // redirected to /login before it ever reached the webhook handler,
    // which is why processed_stripe_events stayed empty through every
    // test: Stripe doesn't follow redirects on webhook deliveries, so
    // the redirect itself just counted as a failed delivery.
    request.nextUrl.pathname.startsWith('/api/stripe-webhook') ||
    // Same issue, same fix - Razorpay calls this server-to-server too,
    // no session cookie ever exists for it. Missed when the Razorpay
    // webhook route was first built, which is why processed_razorpay_events
    // stayed empty through every real-payment test - every delivery was
    // getting redirected to /login before reaching the handler, exactly
    // like the original /api/stripe-webhook incident above.
    request.nextUrl.pathname.startsWith('/api/razorpay-webhook') ||
    // Same issue, same fix - Vercel Cron calls this with an
    // Authorization: Bearer <CRON_SECRET> header (checked inside the
    // route itself), not a session cookie, so it was also being
    // redirected to /login before ever running.
    request.nextUrl.pathname.startsWith('/api/cron/expire-trials') ||
    // /beta is the public beta-launch landing page (see
    // project_beta_launch_plan memory) - has to be reachable by
    // prospects who don't have an account yet, same reasoning as
    // /join. Missing this exclusion meant every visitor without a
    // session got redirected straight to /login before the page ever
    // rendered - the whole point of a landing page is to be reachable
    // by people who aren't signed up yet, so this made it
    // unreachable by its actual target audience.
    request.nextUrl.pathname.startsWith('/beta') ||
    // /api/beta-waitlist is the waitlist signup endpoint the /beta
    // page's form posts to - same "no session exists yet" situation
    // as /api/beta-checkout, just a POST instead of a GET.
    request.nextUrl.pathname.startsWith('/api/beta-waitlist') ||
    // /lessons/preview/[slug] is the free 7-lesson sample given to
    // email leads who haven't signed up yet - same reasoning as /beta:
    // the whole point is that someone with no account can open the
    // link from an email and actually see the page, not get bounced to
    // /login first.
    request.nextUrl.pathname.startsWith('/lessons/preview') ||
    // The bare homepage itself - a logged-out visit now renders a small
    // "front door" (see app/page.tsx: logo, one line on what this is,
    // Join the beta / Log in) instead of silently bouncing straight to
    // /login with no stop in between. Deliberately NOT startsWith, so
    // this only ever covers the exact root path, nothing deeper.
    // Satish's explicit call 2026-08-03: a stranger with no account
    // landing on a bare sign-in form (defaulting to "Welcome back") was
    // the wrong first impression, but /beta itself - the real,
    // actively-converting marketing page - was deliberately left
    // untouched rather than risked, hence this separate, static, no-
    // logic page instead of just redirecting root to /beta.
    request.nextUrl.pathname === '/' ||
    // manifest.json, sw.js, and icons are fetched directly by the
    // browser/OS (PWA installability checks, service worker
    // registration/update polling) with no session cookie sent along -
    // there's no user to check here, ever. Missing this exclusion meant
    // every one of those fetches got redirected to /login (a 307
    // returning an HTML page where the browser expected JSON/JS),
    // discovered 2026-08-02 when a browser stuck retrying a failed
    // manifest.json fetch in a tight loop appeared to correlate with
    // the real /feed page intermittently failing to load - same
    // "forgot to allowlist a public route" pattern as the webhooks,
    // /beta, and /lessons/preview fixes above.
    request.nextUrl.pathname === '/manifest.json' ||
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname.startsWith('/icons/') ||
    request.nextUrl.pathname.startsWith('/favicon')

  if (!user && !isPublicRoute) {
    // Temporary diagnostic logging - visible in Vercel's Runtime/Edge
    // Logs. The two previous fixes here (force-dynamic, then memoizing
    // createClient) didn't resolve the "signed out on every click"
    // report, so guessing a third time isn't the right move - this
    // gives real evidence of WHY getUser() is failing (an actual
    // Supabase error vs. simply no session cookie present at all) the
    // next time it happens.
    console.error('[middleware] blocked, no valid session', {
      path: request.nextUrl.pathname,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStatus: error?.status,
      cookieNames: request.cookies.getAll().map((c) => c.name),
    })
    // Preserve where they were headed so login can send them back
    // there instead of always dumping them on /feed - e.g. bounced off
    // /admin should return to /admin after signing back in, not the
    // community feed.
    const originalPath = request.nextUrl.pathname + request.nextUrl.search
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', originalPath)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
