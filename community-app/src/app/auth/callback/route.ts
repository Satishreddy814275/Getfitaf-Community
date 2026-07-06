import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Google OAuth and the magic-link sign-in both redirect back here with
// a ?code= param — this is what actually exchanges that code for a
// real session and sets it in cookies server-side. Without this
// route, the browser's own Supabase client would still see a session,
// but every Server Component (feed/page.tsx, layout.tsx, etc.) reads
// auth state from cookies, not from the browser client, so pages would
// keep redirecting to /login despite the browser thinking you're
// signed in.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/feed'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('That sign-in link is invalid or has expired.')}`
  )
}
