import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToProfile } from '@/lib/push'
import type { Space } from '@/types'

// TEMPORARY, one-off route - not linked from any UI. Built 2026-08-02
// at Satish's request to retroactively push-notify members about his
// "program is launched" post (id e936361e-f794-4d4b-9972-a998faa81481),
// made before the admin-post-push feature existed so it never fired
// one automatically. Meant to be deleted right after use, not a
// standing feature - he explicitly said "just this once," not "add a
// resend button."
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return new Response('Forbidden', { status: 403 })

  const { postId } = (await req.json()) as { postId?: string }
  if (!postId) return new Response('Missing postId', { status: 400 })

  const admin = createAdminClient()
  const { data: post } = await admin
    .from('posts')
    .select('id, author_id, space, content')
    .eq('id', postId)
    .single()
  if (!post) return new Response('Post not found', { status: 404 })

  const { data: authorProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', post.author_id)
    .single()

  const space = post.space as Space
  const recipientIds =
    space === 'low_ticket'
      ? (
          await admin.from('space_memberships').select('profile_id').eq('space', 'low_ticket')
        ).data?.map((r) => r.profile_id) || []
      : (await admin.from('profiles').select('id').eq('approved', true)).data?.map((r) => r.id) || []

  const targets = recipientIds.filter((id) => id !== post.author_id)
  const preview = (post.content || '').split('\n')[0].replace(/\*\*/g, '').slice(0, 120)

  await Promise.all(
    targets.map((profileId) =>
      sendPushToProfile(profileId, {
        title: `${authorProfile?.full_name || 'GetFit AF'} posted`,
        body: preview || 'Tap to see the new post.',
        url: `/feed?post=${postId}`,
      })
    )
  )

  return Response.json({ ok: true, targeted: targets.length })
}
