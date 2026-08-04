import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminInstagramCampaigns from '@/components/AdminInstagramCampaigns'
import type { InstagramCampaign, InstagramInteraction } from '@/types'

// Same live-session-check reasoning as admin/page.tsx.
export const dynamic = 'force-dynamic'

// Deliberately narrower than the usual is_admin() check the rest of
// /admin uses - this page manages live Instagram DM automation
// (Meta-facing, sends real messages to real commenters), so it's kept
// to Satish only rather than every coach-admin. See actions.ts - every
// mutation re-checks this same email server-side, so this page-level
// check is a UX gate, not the real security boundary.
const RESTRICTED_TO_EMAIL = 'satish0kinng@gmail.com'

export default async function AdminInstagramPage() {
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

  if (!profile?.is_admin || user.email !== RESTRICTED_TO_EMAIL) redirect('/admin')

  const [{ data: campaignsData }, { data: interactionsData }] = await Promise.all([
    supabase.from('instagram_campaigns').select('*').order('created_at', { ascending: false }),
    supabase.from('instagram_interactions').select('campaign_id, state'),
  ])

  const campaigns = (campaignsData || []) as InstagramCampaign[]
  const interactions = (interactionsData || []) as Pick<InstagramInteraction, 'campaign_id' | 'state'>[]

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Instagram Automation</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Comment-to-DM campaigns. Someone comments the keyword on the linked post, gets a public
          reply plus a DM asking them to follow and reply back, then gets the file once they confirm.
          The &quot;confirm&quot; step is self-reported - Instagram&apos;s API doesn&apos;t expose a way to
          actually verify a follow.
        </p>
      </div>

      <AdminInstagramCampaigns campaigns={campaigns} interactions={interactions} />
    </div>
  )
}
