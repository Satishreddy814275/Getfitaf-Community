import type { GuidelineRule } from '@/lib/communityGuidelines'

// Shared read-only rendering of the guidelines body - used by both
// RulesModal (first-time popup) and /guidelines (the permanent page),
// so the two never drift out of sync with each other.
export default function GuidelinesContent({
  intro,
  rules,
}: {
  intro: string
  rules: GuidelineRule[]
}) {
  return (
    <div>
      <p className="text-zinc-400 text-sm mb-5">{intro}</p>
      <ol className="space-y-4">
        {rules.map((rule, i) => (
          <li key={i}>
            <p className="text-white text-sm font-semibold mb-1">
              {i + 1}. {rule.title}
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed">{rule.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
