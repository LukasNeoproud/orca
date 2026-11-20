import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyQualityGateCallFailure } from '@/lib/quality-gate-client'
import {
  fetchQualityGateProposal,
  qualityGateProposalsSupported
} from '@/lib/quality-gate-proposal-client'
import {
  ipcOrRuntimeTargetForHostId,
  runtimeTargetForOwnerEnvironment
} from '@/runtime/runtime-client-target'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { QualityGateProposal } from '../../../../shared/quality-gate-proposal'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

// Why an interval: the host does not signal a new proposal on the gates' change stream.
const POLL_MS = 15_000

type RepoHost = Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>

/**
 * Where a repository's proposals are kept: this app, or the Orca server that keeps the repository.
 * A host reached over plain SSH runs no gate, so it has none.
 */
export function qualityGateProposalTarget(repo: RepoHost): RuntimeClientTarget | null {
  const hostId = getRepoExecutionHostId(repo)
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return { kind: 'local' }
  }
  const target = ipcOrRuntimeTargetForHostId(hostId)
  return target?.kind === 'environment' ? target : null
}

type Stored = { scope: string; proposal: QualityGateProposal | null }

/**
 * The proposal pending for a repository, read while `enabled`. Null when there is none, when the
 * host is older than proposals, and before the first answer. Lost contact keeps what was shown.
 */
export function usePendingQualityGateProposal(
  repo: RepoHost | null,
  enabled: boolean
): {
  proposal: QualityGateProposal | null
  target: RuntimeClientTarget | null
  refresh: () => void
  /** What an answer of the host says is still pending. */
  replace: (next: QualityGateProposal | null) => void
} {
  const target = repo ? qualityGateProposalTarget(repo) : null
  // Why primitives: a fresh target object per render must not restart the reads.
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const repoId = target && repo ? repo.id : null
  const scope = `${environmentId ?? 'local'}\0${repoId ?? ''}`
  const [stored, setStored] = useState<Stored>({ scope, proposal: null })
  const [refreshCount, setRefreshCount] = useState(0)
  // Why: a read that began before an answer would bring back what the answer just settled.
  const answers = useRef(0)

  useEffect(() => {
    if (!enabled || !repoId) {
      return
    }
    const host = runtimeTargetForOwnerEnvironment(environmentId)
    let cancelled = false
    let timer: number | null = null
    const read = async (): Promise<void> => {
      const answersAtStart = answers.current
      const show = (proposal: QualityGateProposal | null): void => {
        if (!cancelled && answers.current === answersAtStart) {
          setStored({ scope, proposal })
        }
      }
      let again = true
      try {
        if (!(await qualityGateProposalsSupported(host))) {
          // An older host is not asked again until the reader opens anew.
          again = false
          show(null)
          return
        }
        show(await fetchQualityGateProposal(host, repoId))
      } catch (error) {
        const failure = classifyQualityGateCallFailure(error)
        if (failure !== 'contact-lost') {
          again = failure !== 'unsupported'
          show(null)
        }
      } finally {
        if (again && !cancelled) {
          timer = window.setTimeout(() => void read(), POLL_MS)
        }
      }
    }
    void read()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [enabled, environmentId, repoId, scope, refreshCount])

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), [])
  const replace = useCallback(
    (proposal: QualityGateProposal | null) => {
      answers.current += 1
      setStored({ scope, proposal })
    },
    [scope]
  )
  return {
    proposal: enabled && repoId && stored.scope === scope ? stored.proposal : null,
    target,
    refresh,
    replace
  }
}
