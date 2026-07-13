import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminFeedList from '@/components/AdminFeedList'
import type { Post } from '@/types'

// Forces this route to always render fresh per-request rather than
// risk being served as a cached/prerendered response — this page's
// whole job is checking a live session and is_admin flag, so a stale
// cached version (e.g. one that happened to render at a moment with no
// session, like a build step) could otherwise get stuck serving a
// "no user, redirect to /login" response to everyone until the next
// deploy busts the cache. Cheap insurance with no real downside since
// this page always does live DB queries anyway.
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/feed')

  const [postsRes, postCountRes, commentCountRes, posterCountRes] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `
        id, content, media_url, media_type, is_announcement, pinned, space, created_at,
        profiles ( id, full_name, avatar_url ),
        comments ( id, content, created_at, profiles ( id, full_name, avatar_url ) ),
        likes ( id, user_id )
      `
      )
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('posts').select('id', { count: 'exact', head: true }),
    supabase.from('comments').select('id', { count: 'exact', head: true }),
    supabase.from('posts').select('author_id'),
  ])

  const posts = (postsRes.data as unknown as Post[] | null) || []
  const totalPosts = postCountRes.count || 0
  const totalComments = commentCountRes.count || 0
  const uniquePosters = new Set((posterCountRes.data || []).map((p) => p.author_id)).size

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Community Moderation</h1>
          <p className="text-sm text-zinc-500 mt-1">Review and remove posts or comments from the feed.</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <Link
            href="/admin/members"
            className="text-sm font-medium text-orange-500 hover:text-orange-400 transition"
          >
            Members →
          </Link>
          <Link
            href="/admin/videos"
            className="text-sm font-medium text-orange-500 hover:text-orange-400 transition"
          >
            Videos →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-2xl font-black text-orange-500">{totalPosts}</p>
          <p className="text-zinc-500 text-xs mt-1">Total posts</p>
        </div>
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-2xl font-black text-orange-500">{totalComments}</p>
          <p className="text-zinc-500 text-xs mt-1">Total comments</p>
        </div>
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-2xl font-black text-orange-500">{uniquePosters}</p>
          <p className="text-zinc-500 text-xs mt-1">Members who've posted</p>
        </div>
      </div>

      <AdminFeedList posts={posts} />
    </div>
  )
}
