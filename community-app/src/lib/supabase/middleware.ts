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
    request.nextUrl.pathname.startsWith('/join')

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
