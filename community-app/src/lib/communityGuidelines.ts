import { createAdminClient } from '@/lib/supabase/admin'

export interface GuidelineRule {
  title: string
  body: string
}

export interface CommunityGuidelines {
  intro: string
  rules: GuidelineRule[]
}

// Same reasoning as beta_page_content (see betaPageContent.ts) - one
// row, no per-user data, so both the public /guidelines page and the
// admin editor go through the service-role client rather than RLS.
const DEFAULT_INTRO =
  'This space works best when it feels safe, encouraging, and easy to show up to every day.'

// rules_text authoring convention mirrors the beta page's "how_it_works"
// section: blank-line-separated blocks, first line of each block is the
// rule title, the rest is the body. Keeps the admin editor to two plain
// textareas instead of a bespoke per-rule form.
function parseRulesText(raw: string): GuidelineRule[] {
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [firstLine, ...rest] = block.split('\n')
      return { title: firstLine.trim(), body: rest.join(' ').trim() }
    })
}

export async function getCommunityGuidelines(): Promise<CommunityGuidelines> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('community_guidelines')
    .select('intro, rules_text')
    .eq('id', 1)
    .maybeSingle()

  return {
    intro: data?.intro || DEFAULT_INTRO,
    rules: parseRulesText(data?.rules_text || ''),
  }
}

// Raw form for the admin editor - two plain textareas (intro, rules
// blocks) rather than the parsed GuidelineRule[] shape above.
export async function getCommunityGuidelinesRaw(): Promise<{ intro: string; rulesText: string }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('community_guidelines')
    .select('intro, rules_text')
    .eq('id', 1)
    .maybeSingle()

  return { intro: data?.intro || DEFAULT_INTRO, rulesText: data?.rules_text || '' }
}
