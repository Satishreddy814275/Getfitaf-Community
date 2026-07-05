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
  created_at: string
  profiles: Profile | null
  comments: Comment[]
  likes: Like[]
}
