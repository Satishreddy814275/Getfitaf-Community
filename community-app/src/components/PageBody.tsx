'use client'

import { useSessionActive } from './SessionActiveProvider'

// The pb-16 here exists purely to clear AppNav's fixed mobile bottom
// tab bar (~64px + safe-area inset) so page content never sits
// underneath it - once that bar is hidden for an active workout
// session (see AppNav), the padding has nothing left to clear and
// would just be a dead gap at the bottom of an otherwise full-focus
// screen, so it's dropped along with the bar.
export default function PageBody({
  hasUser,
  children,
}: {
  hasUser: boolean
  children: React.ReactNode
}) {
  const { sessionActive } = useSessionActive()
  const padded = hasUser && !sessionActive
  return <div className={padded ? 'pb-16 sm:pb-0' : ''}>{children}</div>
}
