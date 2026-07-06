export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface CommentLike {
  id: string
  user_id: string
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

export interface Post {
  id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  is_announcement: boolean
  pinned: boolean
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
