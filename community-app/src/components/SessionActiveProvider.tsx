'use client'

import { createContext, useContext, useState } from 'react'

// Shared across the whole app (provided once in the root layout) so
// that AppNav - which lives outside the page tree, as a sibling of
// {children} rather than a parent - can know whether a workout session
// is active on /workouts and hide the mobile bottom tab bar for the
// same "full focus, nothing competing for attention" reason the page
// header there already hides. A page-local useState couldn't reach
// AppNav at all; this context is the bridge.
const SessionActiveContext = createContext<{
  sessionActive: boolean
  setSessionActive: (active: boolean) => void
} | null>(null)

export function SessionActiveProvider({ children }: { children: React.ReactNode }) {
  const [sessionActive, setSessionActive] = useState(false)
  return (
    <SessionActiveContext.Provider value={{ sessionActive, setSessionActive }}>
      {children}
    </SessionActiveContext.Provider>
  )
}

export function useSessionActive() {
  const ctx = useContext(SessionActiveContext)
  if (!ctx) {
    throw new Error('useSessionActive must be used within a SessionActiveProvider')
  }
  return ctx
}
