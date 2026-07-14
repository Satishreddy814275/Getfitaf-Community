import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { selectProgram } from '@/app/workouts/actions'
import { renderRichText } from '@/lib/richText'

// See admin/page.tsx for why pages that read admin-conditional data
// are forced dynamic.
export const dynamic = 'force-dynamic'

export default async function ProgramsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes, templatesRes, enrollmentRes] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
    supabase
      .from('program_templates')
      .select('id, name, level, equipment_tier, duration_weeks, description')
      .eq('is_published', true)
      .order('created_at'),
    supabase
      .from('program_enrollments')
      .select('program_template_id, program_templates ( name )')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const hasLowTicket = !!membershipRes.data

  // Same access gate as /workouts itself - no point offering a program
  // picker to someone who wouldn't be able to log against it anyway.
  if (!isAdmin && !hasLowTicket) {
    redirect('/join')
  }

  const templates = templatesRes.data || []
  const currentProgramName =
    (enrollmentRes.data?.program_templates as unknown as { name: string } | null)?.name || null

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>
      <h1 className="text-white text-xl font-bold mb-1">Choose Your Program</h1>
      <p className="text-zinc-400 text-sm mb-6">
        {currentProgramName
          ? `You're currently on ${currentProgramName}. Pick a different one below to switch.`
          : 'Pick the program that matches what you have access to - you can swap individual exercises once you get started if something doesn’t fit.'}
      </p>

      {templates.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">
          No programs published yet - check back soon.
        </p>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="glass rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-white font-semibold">{t.name}</p>
                <p className="text-zinc-500 text-xs mt-1 mb-2">
                  {t.level} &middot; {t.equipment_tier} &middot; {t.duration_weeks} week
                  {t.duration_weeks === 1 ? '' : 's'}
                </p>
                {t.description && (
                  <div className="text-zinc-300 text-sm space-y-1.5 max-w-md">
                    {renderRichText(t.description)}
                  </div>
                )}
              </div>
              <form action={selectProgram.bind(null, t.id)}>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Choose this program
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
