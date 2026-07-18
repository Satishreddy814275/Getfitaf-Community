import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProfileForm from '@/components/ProfileForm'
import InstallAppRow from '@/components/InstallAppRow'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, weight_unit')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-lg mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Edit Profile</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Update your name and photo. This is what the rest of the community sees on your posts and comments.
      </p>

      <ProfileForm
        userId={user.id}
        initialName={profile?.full_name || ''}
        initialAvatarUrl={profile?.avatar_url || null}
        initialWeightUnit={profile?.weight_unit === 'lbs' ? 'lbs' : 'kg'}
      />

      <InstallAppRow />
    </div>
  )
}
