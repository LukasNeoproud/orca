import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import {
  qualityGateRepositorySettingsSupported,
  saveQualityGateRepositorySettings
} from '@/lib/quality-gate-client'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'
import type { QualityGateFeedbackLoopSettings } from '../../../../shared/quality-gate-feedback-loop'
import type { QualityGateDefinition } from '../../../../shared/quality-gate-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { repoMatchesHostIdentity } from '../../store/slices/repo-host-identity'

export type RepositoryQualityGateSettingsUpdate =
  | { qualityGates: QualityGateDefinition[] }
  | { qualityGateFeedbackLoop: QualityGateFeedbackLoopSettings }

export type RepositoryQualityGateSettingsSave = (
  repoId: string,
  updates: RepositoryQualityGateSettingsUpdate
) => void | Promise<boolean>

/**
 * `this-computer`: the row is this app's and its window writes it. `host`: another Orca host keeps
 * the row and takes it from this app. `read-only`: that host is older, unreachable, or reached
 * over plain SSH, where no gate runs. `checking`: the host has not said yet.
 */
export type RepositoryQualityGateSettingsPlace = 'this-computer' | 'host' | 'read-only' | 'checking'

const RECHECK_AFTER_LOST_CONTACT_MS = 15_000

/**
 * Where the gates of a repository are written from this window. A repository of another host is
 * written on that host, because that host reads them when it runs a gate; this app keeps no copy
 * that could disagree with it.
 */
export function useRepositoryQualityGateSettingsWriter(
  hostId: ExecutionHostId,
  target: RuntimeClientTarget | null,
  updateRepo: RepositoryQualityGateSettingsSave
): { place: RepositoryQualityGateSettingsPlace; save: RepositoryQualityGateSettingsSave } {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const [supported, setSupported] = useState<{
    environmentId: string
    value: boolean
    /** The host did not answer, which says nothing about its build. */
    lost: boolean
  } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!environmentId) {
      return
    }
    let stale = false
    qualityGateRepositorySettingsSupported({ kind: 'environment', environmentId }).then(
      (value) => {
        if (!stale) {
          setSupported({ environmentId, value, lost: false })
        }
      },
      () => {
        if (!stale) {
          setSupported({ environmentId, value: false, lost: true })
        }
      }
    )
    return () => {
      stale = true
    }
  }, [environmentId, attempt])

  // Read-only until the host answers; it is asked again, since it may only be reconnecting.
  const lost = supported?.lost === true
  useEffect(() => {
    if (!lost) {
      return
    }
    const retry = setTimeout(() => setAttempt((count) => count + 1), RECHECK_AFTER_LOST_CONTACT_MS)
    return () => clearTimeout(retry)
  }, [lost, attempt])

  const saveOnHost = useCallback<RepositoryQualityGateSettingsSave>(
    async (repoId, updates) => {
      if (!environmentId) {
        return false
      }
      const stored = await saveQualityGateRepositorySettings(
        { kind: 'environment', environmentId },
        repoId,
        'qualityGates' in updates
          ? { gates: updates.qualityGates }
          : { feedbackLoop: updates.qualityGateFeedbackLoop }
      )
      // What the host stored, not what was sent: its build may read a field differently.
      useAppStore.setState((state) => ({
        repos: state.repos.map((row) =>
          repoMatchesHostIdentity(row, repoId, hostId)
            ? { ...row, qualityGates: stored.gates, qualityGateFeedbackLoop: stored.feedbackLoop }
            : row
        )
      }))
      return true
    },
    [environmentId, hostId]
  )

  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return { place: 'this-computer', save: updateRepo }
  }
  if (!environmentId) {
    return { place: 'read-only', save: updateRepo }
  }
  if (supported?.environmentId !== environmentId) {
    return { place: 'checking', save: saveOnHost }
  }
  return { place: supported.value ? 'host' : 'read-only', save: saveOnHost }
}
