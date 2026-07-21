import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminBetaPageEditor from '@/components/AdminBetaPageEditor'
import { BETA_PAGE_SECTIONS, getBetaPageContent } from '@/lib/betaPageContent'

// Same live-session-check reasoning as admin/page.tsx - this page only
// ever does fresh DB reads, so there's no benefit to letting it be
// cached and real risk (a cached "not admin" response sticking around).
export const dynamic = 'force-dynamic'

export default async function AdminBetaPagePage() {
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

  const content = await getBetaPageContent()

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Beta Landing Page Copy</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Edit any section of{' '}
          <a href="/beta" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400">
            community.getfitaf.fitness/beta
          </a>{' '}
          directly - each section saves independently. Blank lines start a new paragraph; lines starting with
          &quot;- &quot; become a bullet list. The three program-tier previews on the live page pull real workout data
          automatically and aren&apos;t edited here.
        </p>
      </div>

      <AdminBetaPageEditor sections={BETA_PAGE_SECTIONS} initialContent={content} />
    </div>
  )
}
