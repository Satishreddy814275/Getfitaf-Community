export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface Comment {
  id: string
  content: string
  created_at: string
  profiles: Profile | null
}

export interface Like {
  id: string
  user_id: string
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
