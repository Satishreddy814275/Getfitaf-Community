import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PostComposer from '@/components/PostComposer'
import FeedTabs from '@/components/FeedTabs'
import type { Post } from '@/types'

export default async function FeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, postsRes, streakRes] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('posts')
      .select(
        `
      id, content, media_url, media_type, is_announcement, created_at,
      profiles ( id, full_name, avatar_url ),
      comments ( id, content, created_at, profiles ( id, full_name, avatar_url ) ),
      likes ( id, user_id )
    `
      )
      .order('is_announcement', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('get_user_streak', { uid: user.id }),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const posts = postsRes.data
  const streak = typeof streakRes.data === 'number' ? streakRes.data : 0

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      {streak > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-orange-400">
          <span>🔥</span>
          <span>
            {streak} day{streak === 1 ? '' : 's'} active streak
          </span>
        </div>
      )}
      <PostComposer isAdmin={isAdmin} />
      <div className="mt-8">
        <FeedTabs posts={(posts as unknown as Post[] | null) || []} currentUserId={user.id} />
      </div>
    </div>
  )
}
