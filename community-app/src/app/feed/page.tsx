import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PostComposer from '@/components/PostComposer'
import PostCard from '@/components/PostCard'
import type { Post } from '@/types'

export default async function FeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: posts } = await supabase
    .from('posts')
    .select(
      `
      id, content, media_url, media_type, created_at,
      profiles ( id, full_name, avatar_url ),
      comments ( id, content, created_at, profiles ( id, full_name, avatar_url ) ),
      likes ( id, user_id )
    `
    )
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <PostComposer />
      <div className="mt-8 space-y-6">
        {(posts as unknown as Post[] | null)?.map((post) => (
          <PostCard key={post.id} post={post} currentUserId={user.id} />
        ))}
        {posts?.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">
            No posts yet — be the first to share something with the group.
          </p>
        )}
      </div>
    </div>
  )
}
