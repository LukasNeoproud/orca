import { useEffect, useState } from 'react'
import type { SparsePreset } from '../../../src/shared/worktree/create-types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'

export function useNewWorkspaceAdvancedOptions(args: {
  client: RpcClient | null
  visible: boolean
  repo: MobileWorkspaceRepo | null
}) {
  const repoId = args.repo?.id ?? null
  const [presetsResult, setPresetsResult] = useState<{
    repoId: string
    presets: SparsePreset[]
    error: string
    loading: boolean
  } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<{ repoId: string; id: string } | null>(null)
  const [parentChoice, setParentChoice] = useState<{
    repoId: string
    id: string | null
  } | null>(null)
  const [displayLabel, setDisplayLabel] = useState('')
  const [baseRef, setBaseRef] = useState('')

  useEffect(() => {
    if (!args.visible || !args.client || !repoId || args.repo?.kind === 'folder') {
      return
    }
    // Sparse checkout is supported by the host only for local Git repositories.
    if (args.repo?.connectionId || args.repo?.executionHostId?.startsWith('ssh:')) {
      return
    }
    let stale = false
    setPresetsResult({ repoId, presets: [], error: '', loading: true })
    void args.client
      .sendRequest('repo.sparsePresets', { repo: `id:${repoId}` })
      .then((response) => {
        if (stale) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error.message)
        }
        const presets =
          ((response as RpcSuccess).result as { presets?: SparsePreset[] }).presets ?? []
        setPresetsResult({ repoId, presets, error: '', loading: false })
      })
      .catch((cause) => {
        if (!stale) {
          setPresetsResult({
            repoId,
            presets: [],
            error: cause instanceof Error ? cause.message : 'Failed to load sparse presets.',
            loading: false
          })
        }
      })
    return () => {
      stale = true
    }
  }, [args.client, args.visible, args.repo, repoId])

  const presets = presetsResult?.repoId === repoId ? presetsResult.presets : []
  const preset = presets.find(
    (item) => item.id === selectedPreset?.id && repoId === selectedPreset.repoId
  )
  const canUseSparse =
    args.repo != null &&
    args.repo.kind !== 'folder' &&
    !args.repo?.connectionId &&
    !args.repo?.executionHostId?.startsWith('ssh:')

  return {
    presets,
    presetsLoading: presetsResult?.repoId === repoId && presetsResult.loading,
    presetsError: presetsResult?.repoId === repoId ? presetsResult.error : '',
    canUseSparse,
    selectedPresetId: preset?.id ?? null,
    sparseCheckout:
      canUseSparse && preset ? { directories: preset.directories, presetId: preset.id } : undefined,
    setSelectedPresetId: (id: string | null) => {
      if (repoId) {
        setSelectedPreset(id ? { repoId, id } : null)
      }
    },
    parentWorktreeId: parentChoice?.repoId === repoId ? parentChoice.id : undefined,
    setParentWorktreeId: (id: string | null) => {
      if (repoId) {
        setParentChoice({ repoId, id })
      }
    },
    displayLabel,
    setDisplayLabel,
    baseRef,
    setBaseRef
  }
}
