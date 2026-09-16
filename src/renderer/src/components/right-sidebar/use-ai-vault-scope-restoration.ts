import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react'
import type { AiVaultScope } from '../../../../shared/ai-vault-types'
import { getRestorableAiVaultScope, normalizeAiVaultScopeForContext } from './ai-vault-scope-state'

export function useAiVaultScopeRestoration({
  scope,
  activeProjectKey,
  activeWorktreePath,
  preferredScopeRef,
  userChangedScopeRef,
  setScope
}: {
  scope: AiVaultScope
  activeProjectKey: string | null
  activeWorktreePath: string | null
  preferredScopeRef: RefObject<AiVaultScope>
  userChangedScopeRef: RefObject<boolean>
  setScope: Dispatch<SetStateAction<AiVaultScope>>
}): void {
  // Workspace is the preferred default, but unavailable context still falls back to All.
  useEffect(() => {
    const normalizedScope = normalizeAiVaultScopeForContext({
      scope,
      activeProjectKey,
      activeWorktreePath
    })
    if (normalizedScope !== scope) {
      setScope(normalizedScope)
    }
  }, [activeProjectKey, activeWorktreePath, scope, setScope])

  useEffect(() => {
    const restorableScope = getRestorableAiVaultScope({
      scope,
      activeProjectKey,
      activeWorktreePath,
      preferredScope: preferredScopeRef.current,
      userChangedScope: userChangedScopeRef.current
    })
    if (restorableScope) {
      setScope(restorableScope)
    }
  }, [
    activeProjectKey,
    activeWorktreePath,
    scope,
    preferredScopeRef,
    userChangedScopeRef,
    setScope
  ])
}
