import { useCallback, useEffect, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { readPortableConversationBranches } from '@/lib/portable-conversation-branch-client'
import { conversationBranchError } from '@/lib/conversation-branch-error'
import {
  portableConversationSourceSessionId,
  type PortableConversationBranchesResult,
  type PortableConversationBranchRecord
} from '../../../../shared/portable-conversation-branch'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'

const EMPTY_FAMILY: PortableConversationBranchesResult = { branches: [], returns: [] }
export function usePortableConversationFamily(
  target: RuntimeClientTarget,
  source: PortableConversationSource
) {
  const sessionId = portableConversationSourceSessionId(source)
  const scope = JSON.stringify([target, sessionId])
  const [state, setState] = useState({ scope, family: EMPTY_FAMILY, error: null as string | null })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    let current = true
    void readPortableConversationBranches(target, { sessionId, source }).then(
      (family) => {
        if (current) {
          setState({ scope, family, error: null })
        }
      },
      (failure) => {
        if (current) {
          setState((previous) => ({
            scope,
            family: previous.scope === scope ? previous.family : EMPTY_FAMILY,
            error: conversationBranchError(failure)
          }))
        }
      }
    )
    return () => {
      current = false
    }
  }, [scope, target, sessionId, revision, source])
  const update = (branch: PortableConversationBranchRecord): void => {
    setState((previous) => {
      const family = previous.scope === scope ? previous.family : EMPTY_FAMILY
      return {
        scope,
        error: null,
        family: {
          ...family,
          branches: [...family.branches.filter((item) => item.branchId !== branch.branchId), branch]
        }
      }
    })
    reload()
  }
  return {
    sessionId,
    family: state.scope === scope ? state.family : EMPTY_FAMILY,
    error: state.scope === scope ? state.error : null,
    reload,
    update
  }
}
