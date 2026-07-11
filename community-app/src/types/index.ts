export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface CommentLike {
  id: string
  user_id: string
  // Optional — only populated where the query actually joins it (the
  // main feed query does; admin's post list doesn't need liker names,
  // just the count, so it's left out there rather than changing a
  // query that doesn't need this).
  profiles?: Profile | null
}

export interface Comment {
  id: string
  content: string
  created_at: string
  parent_comment_id: string | null
  profiles: Profile | null
  comment_likes: CommentLike[]
}

export interface Like {
  id: string
  user_id: string
  profiles?: Profile | null
}

export type NotificationType = 'post_like' | 'post_comment' | 'comment_reply' | 'comment_like'

export interface Notification {
  id: string
  type: NotificationType
  post_id: string
  comment_id: string | null
  read: boolean
  created_at: string
  actor: Profile | null
}

export type Space = 'premium' | 'low_ticket'

export interface Post {
  id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  is_announcement: boolean
  pinned: boolean
  space: Space
  created_at: string
  profiles: Profile | null
  comments: Comment[]
  likes: Like[]
}

export interface LeaderboardRow {
  rank: number
  user_id: string
  first_name: string
  post_count: number
  comment_count: number
  score: number
  streak: number
}
