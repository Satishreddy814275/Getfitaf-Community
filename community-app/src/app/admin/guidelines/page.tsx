import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminGuidelinesEditor from '@/components/AdminGuidelinesEditor'
import { getCommunityGuidelinesRaw } from '@/lib/communityGuidelines'

// Same live-session-check reasoning as admin/beta-page/page.tsx.
export const dynamic = 'force-dynamic'

export default async function AdminGuidelinesPage() {
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

  const { intro, rulesText } = await getCommunityGuidelinesRaw()

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Community Guidelines</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Edit the rules shown in the first-time welcome modal and on{' '}
          <a
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:text-orange-400"
          >
            community.getfitaf.fitness/guidelines
          </a>
          .
        </p>
      </div>

      <AdminGuidelinesEditor initialIntro={intro} initialRulesText={rulesText} />
    </div>
  )
}
