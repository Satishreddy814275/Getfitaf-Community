// Shared between feed/page.tsx's initial load and feed/actions.ts's
// loadMorePosts - both fetch pages of the same table with the same
// nested shape, so a shared constant/select string keeps them from
// silently drifting out of sync (e.g. a scrolled-in post rendering
// differently than one loaded on first paint because someone edited
// one select and not the other).
export const FEED_PAGE_SIZE = 15

export const FEED_POST_SELECT = `
  id, content, media_url, media_type, is_announcement, pinned, space, created_at, edited_at,
  profiles ( id, full_name, avatar_url ),
  comments ( id, content, created_at, parent_comment_id, profiles ( id, full_name, avatar_url ), comment_likes ( id, user_id, profiles ( id, full_name, avatar_url ) ) ),
  likes ( id, user_id, profiles ( id, full_name, avatar_url ) )
`
