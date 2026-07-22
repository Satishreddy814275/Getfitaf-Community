import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import {
  ListChecks,
  Scale,
  IndianRupee,
  HelpCircle,
  PersonStanding,
  Dumbbell,
  Building2,
  CalendarDays,
  MessagesSquare,
  LineChart,
} from 'lucide-react'
import WaitlistForm from '@/components/WaitlistForm'
import { DayReadOnlyView } from '@/components/AdminProgramsList'
import BetaProgressPreview from '@/components/BetaProgressPreview'
import BetaCommunityPreview from '@/components/BetaCommunityPreview'
import BetaCountdown from '@/components/BetaCountdown'
import BetaStickyCTA from '@/components/BetaStickyCTA'
import { renderRichText } from '@/lib/richText'
import { getBetaPageContent } from '@/lib/betaPageContent'
import { getBetaTierPreviews, type TierPreview } from '@/lib/betaProgramPreviews'
import { getWaitlistCount } from '@/lib/betaLaunchSignals'

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

  const [content, tierPreviews, waitlistCount] = await Promise.all([
    getBetaPageContent(),
    getBetaTierPreviews(),
    getWaitlistCount(),
  ])
  const faqBlocks = parseFaqBlocks(content.faq)
  const howItWorksSteps = parseFaqBlocks(content.how_it_works)
  const coachBio = parseCoachBio(content.about_coach)
  const whatsIncludedIntro = parseFeatureIntro(content.whats_included_intro)

  return (
    <div className="min-h-full bg-[#0a0a0a] relative overflow-hidden">
      <div className="w-full max-w-2xl mx-auto py-16 px-4 relative">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-block rounded-2xl border border-orange-500/50 px-8 py-5">
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              GET<span className="text-orange-500">FIT</span> AF
            </h1>
            <p className="text-orange-500/90 text-xs font-semibold uppercase tracking-widest mt-2">
              Community Membership — Beta
            </p>
          </div>
          <div className="text-zinc-300 text-sm mt-6 leading-relaxed text-left space-y-3">
            {renderRichText(content.hero)}
          </div>
        </div>

        {/* How it works - quick 3-step overview before asking for
            anything, so someone can grasp the shape of the offer
            without reading the full What's Included section first. */}
        {howItWorksSteps.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-3 mb-10">
            {howItWorksSteps.map((step, i) => (
              <div key={i} className="rounded-xl p-4 bg-zinc-900/40 border border-zinc-800 text-center">
                <div className="w-7 h-7 rounded-full bg-orange-500 text-black text-sm font-bold flex items-center justify-center mx-auto mb-2">
                  {i + 1}
                </div>
                <p className="text-white text-sm font-semibold mb-1">{step.question}</p>
                <p className="text-zinc-400 text-xs leading-relaxed">{step.answer}</p>
              </div>
            ))}
          </div>
        )}

        {/* CTA - top */}
        <div
          id="waitlist-top"
          className="rounded-2xl p-6 mb-10 bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20"
        >
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
              <BetaCountdown launchAt={LAUNCH_AT} />
            </div>
          )}
          {waitlistCount > 0 && (
            <p className="text-zinc-500 text-xs text-center mt-3">
              🔥 {waitlistCount} {waitlistCount === 1 ? 'person has' : 'people have'} already joined the waitlist
            </p>
          )}
        </div>

        {/* Who's behind this - trust/credibility before the details,
            since there's no track record or reviews to point to yet
            for this specific beta. Uses the same dedicated headshot
            already used in the Learn Portal lesson sign-offs (a real
            photoshoot photo), not the generic Supabase profile
            avatar - bundled as a static public asset since it's a
            fixed brand photo, not user-editable data. Stacked layout
            (photo/name/credential/stats centered on top, story below)
            rather than side-by-side, since the credentials + stats +
            founder story is a longer read than the old one-line bio -
            side-by-side made it feel cramped. Stats are pulled out of
            the prose into pills since they're the strongest trust
            signal on a page with no track record yet. */}
        <div className="rounded-xl p-6 mb-10 bg-zinc-900/40 border border-zinc-800">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/satish-photo.jpg"
              alt="Satish"
              width={76}
              height={76}
              className="rounded-full object-cover object-top border-2 border-orange-500/60 aspect-square mb-3"
            />
            <p className="text-white text-base font-bold">Satish</p>
            {coachBio.credential && (
              <p className="text-orange-500/90 text-[10px] font-semibold uppercase tracking-widest mt-1">
                {coachBio.credential}
              </p>
            )}
            {coachBio.stats.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-3.5">
                {coachBio.stats.map((stat, i) => (
                  <span
                    key={i}
                    className="text-orange-300 text-[11px] bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5"
                  >
                    {stat}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-sm text-zinc-300 leading-relaxed space-y-3 mt-4 text-left">
            {renderRichText(coachBio.body)}
          </div>
        </div>

        {/* What's included */}
        <div className="mb-14">
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-orange-500" aria-hidden="true" />
            What&apos;s included
          </h3>
          {whatsIncludedIntro.features.length > 0 && (
            <div className="space-y-2.5 mb-4">
              {whatsIncludedIntro.features.map((feature, i) => {
                const Icon = [CalendarDays, MessagesSquare, LineChart][i % 3]
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
                    </span>
                    <span className="text-sm text-zinc-300 leading-relaxed">{feature}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="text-sm text-zinc-300 space-y-3 mb-6">{renderRichText(whatsIncludedIntro.rest)}</div>

          <div className="space-y-5 mb-6">
            <TierPreviewCard
              icon={<PersonStanding className="w-4 h-4 text-orange-400" aria-hidden="true" />}
              description={content.tier_no_equipment}
              preview={tierPreviews.noEquipment}
            />
            <TierPreviewCard
              icon={<Dumbbell className="w-4 h-4 text-orange-400" aria-hidden="true" />}
              description={content.tier_bands_dumbbells}
              preview={tierPreviews.bandsAndDumbbells}
            />
            <TierPreviewCard
              icon={<Building2 className="w-4 h-4 text-orange-400" aria-hidden="true" />}
              description={content.tier_full_gym}
              preview={tierPreviews.fullGym}
            />
          </div>

          <div className="glass rounded-xl p-5 mb-5">
            <div className="text-sm text-zinc-300 mb-3">{renderRichText(content.whats_included_logging)}</div>
            <BetaProgressPreview />
          </div>

          <div className="glass rounded-xl p-5 mb-6">
            <div className="text-sm text-zinc-300 mb-3">{renderRichText(content.whats_included_community)}</div>
            <BetaCommunityPreview />
          </div>

          <div className="text-sm text-zinc-300">{renderRichText(content.whats_included_closing)}</div>
        </div>

        {/* What this is / isn't */}
        <div className="mb-14">
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5 text-orange-500" aria-hidden="true" />
            What this is - and isn&apos;t
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl p-5 bg-orange-500/[0.06] border border-orange-500/25 border-l-4 border-l-orange-500">
              <p className="text-orange-400 text-xs font-bold uppercase tracking-wide mb-2">This is</p>
              <div className="space-y-2 text-sm text-zinc-200">{renderRichText(content.boundaries_this_is)}</div>
            </div>
            <div className="rounded-xl p-5 bg-zinc-500/[0.06] border border-zinc-700 border-l-4 border-l-zinc-500">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-wide mb-2">This isn&apos;t</p>
              <div className="space-y-2 text-sm text-zinc-300">{renderRichText(content.boundaries_isnt)}</div>
            </div>
          </div>
        </div>

        {/* Pricing & terms */}
        <div className="mb-14">
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-orange-500" aria-hidden="true" />
            Pricing &amp; terms
          </h3>
          <div className="rounded-2xl p-6 space-y-3 text-sm text-zinc-200 bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-transparent border border-orange-500/25">
            {renderRichText(content.pricing_terms)}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-14">
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-orange-500" aria-hidden="true" />
            FAQ
          </h3>
          <div className="space-y-3 text-sm">
            {faqBlocks.map((block, i) => (
              <div key={i} className="glass rounded-xl p-4">
                <p className="text-white font-semibold mb-1.5 flex items-start gap-2">
                  <span className="text-orange-500 shrink-0">Q.</span>
                  {block.question}
                </p>
                <div className="text-zinc-400 leading-relaxed space-y-2 pl-5">{renderRichText(block.answer)}</div>
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

      <BetaStickyCTA isLive={isLive} />
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

// Coach bio format (see betaPageContent.ts label): line 1 is the
// credential line, line 2 is a "|"-separated list of stat pills (e.g.
// "7+ years|1,000+ clients coached"), then a blank line, then the
// story as normal paragraphs rendered via renderRichText. Falls back
// to treating the whole thing as the story if it doesn't match the
// format, so older/simpler content never disappears.
function parseCoachBio(text: string): { credential: string; stats: string[]; body: string } {
  if (!text || !text.trim()) return { credential: '', stats: [], body: '' }
  const [headerBlock, ...bodyBlocks] = text.trim().split(/\n\s*\n/)
  const body = bodyBlocks.join('\n\n')
  if (!headerBlock || !body) {
    return { credential: '', stats: [], body: text.trim() }
  }
  const headerLines = headerBlock.split('\n')
  const credential = headerLines[0]?.trim() || ''
  const stats = (headerLines[1] || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  return { credential, stats, body }
}

// What's included intro format (see betaPageContent.ts label): the
// first block is one feature per line (rendered as a small icon list -
// icons just cycle through a fixed set, so this only really reads well
// with 3 lines), then a blank line, then the rest as normal paragraphs
// rendered via renderRichText. Falls back to rendering everything as
// plain prose (no icon list) if there's no blank line to split on, so
// older/simpler content never disappears.
function parseFeatureIntro(text: string): { features: string[]; rest: string } {
  if (!text || !text.trim()) return { features: [], rest: '' }
  const [firstBlock, ...restBlocks] = text.trim().split(/\n\s*\n/)
  const rest = restBlocks.join('\n\n')
  if (!firstBlock || !rest) {
    return { features: [], rest: text.trim() }
  }
  const features = firstBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return { features, rest }
}

function TierPreviewCard({
  icon,
  description,
  preview,
}: {
  icon: ReactNode
  description: string
  preview: TierPreview
}) {
  return (
    <div className="rounded-xl p-5 bg-zinc-900/40 border border-zinc-800 border-t-2 border-t-orange-500/50">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center mt-0.5">
          {icon}
        </span>
        <div className="text-sm text-zinc-300">{renderRichText(description)}</div>
      </div>
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
