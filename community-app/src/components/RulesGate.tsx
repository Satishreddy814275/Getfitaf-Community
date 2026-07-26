'use client'

import { useEffect, useState } from 'react'
import RulesModal from './RulesModal'
import type { GuidelineRule } from '@/lib/communityGuidelines'

// Sequences the first-time rules acknowledgment ahead of whatever's
// passed as children (e.g. WorkoutBuilderPromptModal) - children only
// render once the rules have been acknowledged, so the two never
// appear stacked on top of each other. Boolean localStorage flag (not
// a date like WorkoutBuilderPromptModal's) since this is a true
// one-time-ever acknowledgment, not a daily reminder.
//
// acknowledged starts as null (not false) so nothing renders - not
// even children - until the localStorage check has actually run on
// the client. Rendering children immediately during that gap would
// let a daily-reset modal like WorkoutBuilderPromptModal flash in
// before the rules gate has had a chance to block it.
export default function RulesGate({
  userId,
  intro,
  rules,
  children,
}: {
  userId: string
  intro: string
  rules: GuidelineRule[]
  children: React.ReactNode
}) {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null)
  const storageKey = `rules-ack-${userId}`

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAcknowledged(window.localStorage.getItem(storageKey) === 'true')
  }, [storageKey])

  if (acknowledged === null) return null

  if (!acknowledged) {
    return (
      <RulesModal
        intro={intro}
        rules={rules}
        onAcknowledge={() => {
          window.localStorage.setItem(storageKey, 'true')
          setAcknowledged(true)
        }}
      />
    )
  }

  return <>{children}</>
}
