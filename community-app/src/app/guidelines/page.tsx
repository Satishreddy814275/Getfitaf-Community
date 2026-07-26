import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import GuidelinesContent from '@/components/GuidelinesContent'
import { getCommunityGuidelines } from '@/lib/communityGuidelines'

// Permanent, always-reachable version of the rules shown once in
// RulesModal - lives behind a nav link so acknowledging the modal once
// doesn't mean the rules are gone for good.
export const dynamic = 'force-dynamic'

export default async function GuidelinesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { intro, rules } = await getCommunityGuidelines()

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <h1 className="text-white text-xl font-bold mb-4">Community Guidelines</h1>

      <div className="glass rounded-2xl p-5">
        <GuidelinesContent intro={intro} rules={rules} />
      </div>
    </div>
  )
}
