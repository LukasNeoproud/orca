import type { ExecutionHostId } from '../../../../shared/execution-host'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { settingsForRepoOwner } from '@/store/slices/worktrees/listing/worktree-owner-settings'
import { searchRuntimeRepoBaseRefDetails } from '@/runtime/runtime-repo-client'
import {
  previewSimplifiedWorktree,
  ignoreSimplifiedWorktreeLocally
} from '@/lib/simplified-worktree-preview'
import type { SimplifiedWorktreeSubmission } from '@/lib/simplified-worktree-submission'
import type { BaseRefSearchResult } from '../../../../shared/repo-types'
import type { WorktreeCreationPreview } from '../../../../shared/worktree/explicit-creation'

export function useSimplifiedWorktreeForm({
  enabled,
  repoId,
  initialName,
  initialBaseBranch,
  hostId
}: {
  enabled: boolean
  repoId: string
  initialName: string
  initialBaseBranch?: string
  hostId?: ExecutionHostId | null
}) {
  const repo = useAppStore((s) =>
    findRepoForHost(s.repos, repoId, { hostId, settings: s.settings })
  )
  const [branch, setBranch] = useState(initialName)
  const [remote, setRemote] = useState<BaseRefSearchResult | null>(null)
  const [customName, setCustomName] = useState<string | null>(null)
  const [customLabel, setCustomLabel] = useState<string | null>(null)
  const [base, setBase] = useState<string | undefined>(undefined)
  const [rootOverride, setRoot] = useState<string | null>(null)
  const [layoutOverride, setLayout] = useState<'nested' | 'flat' | null>(null)
  const layout = layoutOverride ?? repo?.simplifiedWorktreeLayout ?? 'nested'
  const [branches, setBranches] = useState<BaseRefSearchResult[]>([])
  const [preview, setPreview] = useState<WorktreeCreationPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const name = customName ?? branch
  const displayName = customLabel ?? name
  const root =
    rootOverride ??
    repo?.worktreeBasePath ??
    (repo?.simplifiedWorktreeLocation === 'orca-default' ? '' : '.worktrees')
  const baseBranch = base ?? initialBaseBranch ?? repo?.worktreeBaseRef
  const explicitCreation = useMemo(
    () => ({
      branch: remote
        ? { kind: 'remote' as const, name: remote.localBranchName, remoteRef: remote.refName }
        : { kind: 'new' as const, name: branch },
      destination: {
        ...(root ? { root } : {}),
        relativeDirectory: layout === 'nested' ? name : name.replaceAll('/', '-')
      }
    }),
    [branch, layout, name, remote, root]
  )
  const submission = useMemo<SimplifiedWorktreeSubmission>(
    () => ({ explicitCreation, name, displayName, baseBranch }),
    [explicitCreation, name, displayName, baseBranch]
  )

  useEffect(() => {
    if (!enabled || !repoId) {
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      void searchRuntimeRepoBaseRefDetails(
        settingsForRepoOwner(useAppStore.getState(), repoId, hostId),
        repoId,
        branch,
        30,
        hostId ?? undefined
      )
        .then((rows) => {
          if (!stale) {
            setBranches(rows)
          }
        })
        .catch(() => {
          if (!stale) {
            setBranches([])
          }
        })
    }, 150)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [enabled, repoId, branch, hostId])

  useEffect(() => {
    setPreview(null)
    setError(null)
    if (!enabled || !repoId || !branch.trim() || !name.trim()) {
      setPending(false)
      return
    }
    let stale = false
    setPending(true)
    const timer = setTimeout(() => {
      void previewSimplifiedWorktree(repoId, explicitCreation, baseBranch, hostId)
        .then((result) => {
          if (!stale) {
            setPreview(result)
          }
        })
        .catch((err: unknown) => {
          if (!stale) {
            setError(err instanceof Error ? err.message : String(err))
          }
        })
        .finally(() => {
          if (!stale) {
            setPending(false)
          }
        })
    }, 180)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [enabled, repoId, branch, name, explicitCreation, baseBranch, hostId])

  const validate = useCallback(async (): Promise<SimplifiedWorktreeSubmission | null> => {
    setPending(true)
    try {
      const result = await previewSimplifiedWorktree(repoId, explicitCreation, baseBranch, hostId)
      setPreview(result)
      if (result.occupyingWorktree || result.destinationExists) {
        return null
      }
      return {
        ...submission,
        explicitCreation: { ...explicitCreation, branch: result.branch },
        baseBranch: result.baseBranch
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setPending(false)
    }
  }, [repoId, explicitCreation, baseBranch, submission, hostId])
  const ignoreLocally = async () => {
    setPending(true)
    try {
      await ignoreSimplifiedWorktreeLocally(repoId, explicitCreation, baseBranch, hostId)
      setPreview(await previewSimplifiedWorktree(repoId, explicitCreation, baseBranch, hostId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }
  return {
    ignoreLocally,
    branch,
    setBranch,
    remote,
    setRemote,
    customName,
    setCustomName,
    customLabel,
    setCustomLabel,
    name,
    displayName,
    baseBranch,
    setBase,
    root,
    setRoot,
    layout,
    setLayout,
    branches,
    preview,
    error,
    pending,
    validate,
    disabled:
      pending ||
      !preview ||
      Boolean(preview.occupyingWorktree) ||
      preview.destinationExists ||
      !displayName.trim()
  }
}
export type SimplifiedWorktreeForm = ReturnType<typeof useSimplifiedWorktreeForm>
