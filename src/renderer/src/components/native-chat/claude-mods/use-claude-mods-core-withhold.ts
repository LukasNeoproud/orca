import { useEffect, useState } from 'react'

/** How long core's row stays hidden for a mod's drawing before it shows anyway. */
export const CLAUDE_MODS_WITHHOLD_MS = 5000

/** True while core's row waits for a hooked mod's first answer, for up to `CLAUDE_MODS_WITHHOLD_MS`. */
export function useClaudeModsCoreWithheld(awaiting: boolean): boolean {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!awaiting) {
      return
    }
    const timer = setTimeout(() => setExpired(true), CLAUDE_MODS_WITHHOLD_MS)
    return () => {
      clearTimeout(timer)
      setExpired(false)
    }
  }, [awaiting])
  return awaiting && !expired
}
