import type { Metadata } from 'next'
import WaitlistForm from '@/components/WaitlistForm'
import { DayReadOnlyView } from '@/components/AdminProgramsList'
import BetaProgressPreview from '@/components/BetaProgressPreview'
import BetaCommunityPreview from '@/components/BetaCommunityPreview'
import { renderRichText } from '@/lib/richText'
import { getBetaPageContent } from '@/lib/betaPageContent'
import { getBetaTierPreviews, type TierPreview } from '@/lib/betaProgramPreviews'

// Single URL, two modes - see project_beta_launch_plan memory. Only
// the CTA changes between "Join the waitlist" (before launch) and
// "Reserve your spot" (from launch day on); every other section on
// the page is identical throughout, built once rather than twice.
//
// 2026-08-01T00:00:00+05:30 - IST, since that's the timezone this
// launches in. Comparing against Date.now() means this page flips
// modes on its own at midnight on launch day with no manual edit or
// redeploy needed.
const LAUNCH_AT = new Date('2026-08-01T00:00:00+05:30').getTime()

export const metadata: Metadata = {
  title: 'GetFit AF Community — Beta Launch',
  description:
    'Self-guided training, daily lessons, and a real community - beta pricing for the first 50 members.',
}

// This page's copy comes from public.beta_page_content (edited via
// /admin/beta-page, see betaPageContent.ts) rather than being
// hardcoded, and the three tier previews below pull real Week 1/Day 1
// program data (see betaProgramPreviews.ts) instead of screenshots -
// both fetched fresh per request, so force-dynamic rather than letting
// this get statically optimized at build time.
export const dynamic = 'force-dynamic'

export default async function BetaLandingPage() {
  // Deliberate: this is a Server Component, computed fresh per
  // request (not a client re-render), so there's no "unstable across
  // renders" concern the react-hooks/purity rule is guarding against -
  // same reasoning already used for the Date.now() call in
  // AdminTemplatesList.tsx.
  // eslint-disable-next-line react-hooks/purity
  const isLive = Date.now() >= LAUNCH_AT

  const [content, tierPreviews] = await Promise.all([getBetaPageContent(), getBetaTierPreviews()])
  const faqBlocks = parseFaqBlocks(content.faq)

  return (
    <div className="min-h-full bg-[#0a0a0a]">
      <div className="w-full max-w-2xl mx-auto py-16 px-4">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            GET<span className="text-orange-500">FIT</span> AF
          </h1>
          <p className="text-zinc-400 text-sm mt-2">Community Membership — Beta</p>
          <div className="text-zinc-300 text-sm mt-6 max-w-lg mx-auto leading-relaxed text-left space-y-3">
            {renderRichText(content.hero)}
          </div>
        </div>

        {/* CTA - top */}
        <div className="glass rounded-2xl p-6 mb-10">
          {isLive ? (
            <div className="text-center">
              <p className="text-orange-500 text-sm font-semibold mb-3">
                Doors are open - 50 spots, first come first served
              </p>
              <a
                href="/api/beta-checkout"
                className="inline-block w-full sm:w-auto text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl transition text-sm"
              >
                Reserve your spot - ₹249 first month
              </a>
              <p className="text-zinc-500 text-xs mt-3">
                Then ₹499/month. Cancel anytime, no charge until then.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-orange-500 text-sm font-semibold mb-1 text-center">
                Opens Aug 1, 2026 - 50 spots at ₹249 your first month
              </p>
              <p className="text-zinc-500 text-xs mb-4 text-center">
                Join the waitlist and we&apos;ll email you the second doors open.
              </p>
              <WaitlistForm />
            </div>
          )}
        </div>

        {/* What's included */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">What&apos;s included</h3>
          <div className="text-sm text-zinc-300 space-y-3 mb-5">{renderRichText(content.whats_included_intro)}</div>

          <div className="space-y-5 mb-5">
            <TierPreviewCard description={content.tier_no_equipment} preview={tierPreviews.noEquipment} />
            <TierPreviewCard description={content.tier_bands_dumbbells} preview={tierPreviews.bandsAndDumbbells} />
            <TierPreviewCard description={content.tier_full_gym} preview={tierPreviews.fullGym} />
          </div>

          <div className="glass rounded-xl p-4 mb-4">
            <div className="text-sm text-zinc-300 mb-3">{renderRichText(content.whats_included_logging)}</div>
            <BetaProgressPreview />
          </div>

          <div className="glass rounded-xl p-4 mb-5">
            <div className="text-sm text-zinc-300 mb-3">{renderRichText(content.whats_included_community)}</div>
            <BetaCommunityPreview />
          </div>

          <div className="text-sm text-zinc-300">{renderRichText(content.whats_included_closing)}</div>
        </div>

        {/* What this is / isn't */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">What this is - and isn&apos;t</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-2">This is</p>
              <div className="space-y-2 text-sm text-zinc-300">{renderRichText(content.boundaries_this_is)}</div>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-2">This isn&apos;t</p>
              <div className="space-y-2 text-sm text-zinc-300">{renderRichText(content.boundaries_isnt)}</div>
            </div>
          </div>
        </div>

        {/* Pricing & terms */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">Pricing &amp; terms</h3>
          <div className="glass rounded-xl p-4 space-y-2 text-sm text-zinc-300">
            {renderRichText(content.pricing_terms)}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">FAQ</h3>
          <div className="space-y-4 text-sm">
            {faqBlocks.map((block, i) => (
              <div key={i}>
                <p className="text-white font-semibold mb-1">{block.question}</p>
                <div className="text-zinc-400 leading-relaxed space-y-2">{renderRichText(block.answer)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA - bottom */}
        <div className="glass rounded-2xl p-6">
          {isLive ? (
            <div className="text-center">
              <a
                href="/api/beta-checkout"
                className="inline-block w-full sm:w-auto text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl transition text-sm"
              >
                Reserve your spot - ₹249 first month
              </a>
            </div>
          ) : (
            <div>
              <p className="text-orange-500 text-sm font-semibold mb-4 text-center">
                50 spots at ₹249 - join the waitlist to get first access on Aug 1
              </p>
              <WaitlistForm />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// FAQ content is edited as one free-text block (see beta_page_content
// seed / admin editor) - question on one line, answer on the following
// line(s), blank line between pairs. Kept as a small dedicated parser
// rather than reusing renderRichText's generic paragraph/bullet split,
// since the question needs distinct bold styling from its answer.
function parseFaqBlocks(text: string): { question: string; answer: string }[] {
  if (!text || !text.trim()) return []
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n')
      return { question: lines[0] || '', answer: lines.slice(1).join('\n').trim() }
    })
    .filter((b) => b.question)
}

function TierPreviewCard({ description, preview }: { description: string; preview: TierPreview }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-sm text-zinc-300 mb-3">{renderRichText(description)}</div>
      {preview ? (
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">
            Real Week 1, Day 1 - {preview.dayLabel}
          </p>
          <DayReadOnlyView exercises={preview.exercises} />
        </div>
      ) : (
        <p className="text-zinc-600 text-xs italic">Preview not available right now.</p>
      )}
    </div>
  )
}
