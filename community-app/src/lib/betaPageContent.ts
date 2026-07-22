import { createAdminClient } from '@/lib/supabase/admin'

// Editable-copy sections for the public /beta landing page - see
// project_beta_launch_plan memory. Satish asked to be able to edit
// every word himself via an admin screen instead of asking for a code
// change each time. Ordered the way they appear top-to-bottom on the
// page; /admin/beta-page renders one textarea per entry in this order.
export const BETA_PAGE_SECTIONS = [
  { key: 'hero', label: 'Hero — "Who is this for?"' },
  {
    key: 'how_it_works',
    label:
      'How it works - 3 steps (first line of each block is the step title, rest is the description, blank line between steps)',
  },
  {
    key: 'about_coach',
    label:
      "Who's behind this - line 1: credential line, line 2: stats separated by | (e.g. 7+ years|1,000+ clients coached), blank line, then the story as normal paragraphs",
  },
  {
    key: 'whats_included_intro',
    label:
      "What's included — intro. Block 1: 3 short lines for the icon feature list. Block 2: the \"proof\" line (shown as a highlighted badge, e.g. \"I've already built...\"). Block 3: first line is the \"What's live now\" label, remaining lines are bullet points. Separate each block with a blank line.",
  },
  {
    key: 'tier_no_equipment',
    label: '"No equipment" tier description (above its live preview)',
  },
  {
    key: 'tier_bands_dumbbells',
    label: '"Bands & dumbbells" tier description (above its live preview)',
  },
  {
    key: 'tier_full_gym',
    label: '"Full gym access" tier description (above its live preview)',
  },
  {
    key: 'whats_included_logging',
    label: "What's included — logging/progress line (above the live progress example)",
  },
  {
    key: 'whats_included_community',
    label: "What's included — community line (above the live community example)",
  },
  {
    key: 'whats_included_closing',
    label: "What's included — soft closing line (below both examples)",
  },
  { key: 'boundaries_this_is', label: 'What this is (boundaries, left column)' },
  { key: 'boundaries_isnt', label: "What this isn't (boundaries, right column)" },
  { key: 'pricing_terms', label: 'Pricing & terms' },
  { key: 'faq', label: 'FAQ' },
] as const

export type BetaPageContentKey = (typeof BETA_PAGE_SECTIONS)[number]['key']

// Fallback defaults so a missing row (e.g. right after a fresh deploy,
// before the migration's seed data has been touched) never renders as
// blank on the live page - mirrors the seed content in the
// beta_page_content migration.
const DEFAULTS: Record<BetaPageContentKey, string> = {
  hero: '',
  how_it_works: '',
  about_coach: '',
  whats_included_intro: '',
  tier_no_equipment: '',
  tier_bands_dumbbells: '',
  tier_full_gym: '',
  whats_included_logging: '',
  whats_included_community: '',
  whats_included_closing: '',
  boundaries_this_is: '',
  boundaries_isnt: '',
  pricing_terms: '',
  faq: '',
}

// Reads via the admin client on purpose, same as beta_waitlist - this
// table has no public RLS policy at all, so both the public /beta page
// and the /admin/beta-page editor go through the service role. There's
// no per-user data here to protect via RLS; it's just simpler to have
// exactly one access path instead of a public-read policy plus an
// admin-write path.
export async function getBetaPageContent(): Promise<Record<BetaPageContentKey, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('beta_page_content').select('key, content')

  const result = { ...DEFAULTS }
  for (const row of data || []) {
    if (row.key in result) {
      result[row.key as BetaPageContentKey] = row.content
    }
  }
  return result
}
