import { useMemo, useState } from 'react'
import type { WorktreeCreationPreview } from '../../../src/shared/worktree/explicit-creation'
import type { MobileComposerCreateSelection } from '../tasks/mobile-composer-source-types'
import {
  buildMobileExplicitWorktreeCreation,
  ignoreMobileWorktreeCreationLocally,
  previewMobileExplicitWorktreeCreation,
  type MobileWorktreeLayout,
  type MobileWorktreeLocation
} from '../tasks/mobile-explicit-worktree-creation'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'

export function useMobileWorktreeLocation(args: {
  client: RpcClient | null
  repo: MobileWorkspaceRepo | null
  name: string
  branchNameOverride?: string
  baseRefOverride?: string
  selection: MobileComposerCreateSelection | null
}) {
  const [location, setLocation] = useState<MobileWorktreeLocation>('automatic')
  const [layout, setLayout] = useState<MobileWorktreeLayout>('nested')
  const [customRoot, setCustomRoot] = useState('')
  const [inspection, setInspection] = useState<{
    key: string
    preview: WorktreeCreationPreview | null
    error: string
    pending: boolean
  } | null>(null)
  const explicitCreation = useMemo(
    () =>
      location === 'automatic'
        ? null
        : buildMobileExplicitWorktreeCreation({
            name: args.name,
            branchNameOverride: args.branchNameOverride,
            selection: args.selection,
            location,
            customRoot,
            layout
          }),
    [args.name, args.branchNameOverride, args.selection, customRoot, layout, location]
  )
  const baseBranch =
    args.baseRefOverride?.trim() ||
    (args.selection?.kind === 'branch' ? args.selection.baseBranch : args.repo?.worktreeBaseRef)
  const previewKey = JSON.stringify({
    repoId: args.repo?.id,
    baseBranch,
    explicitCreation
  })
  const currentInspection = inspection?.key === previewKey ? inspection : null

  async function previewNow(): Promise<WorktreeCreationPreview | null> {
    if (!args.client || !args.repo || !explicitCreation) {
      return null
    }
    setInspection({ key: previewKey, preview: null, error: '', pending: true })
    try {
      const result = await previewMobileExplicitWorktreeCreation({
        client: args.client,
        repoId: args.repo.id,
        name: args.name,
        baseBranch,
        explicitCreation
      })
      setInspection((current) =>
        current?.key === previewKey ? { ...current, preview: result } : current
      )
      return result
    } catch (cause) {
      setInspection((current) =>
        current?.key === previewKey
          ? {
              ...current,
              preview: null,
              error: cause instanceof Error ? cause.message : 'Could not preview worktree location.'
            }
          : current
      )
      return null
    } finally {
      setInspection((current) =>
        current?.key === previewKey ? { ...current, pending: false } : current
      )
    }
  }

  async function ignoreLocally(): Promise<void> {
    if (
      !args.client ||
      !args.repo ||
      !explicitCreation ||
      !currentInspection?.preview?.needsLocalIgnore
    ) {
      return
    }
    setInspection((current) =>
      current?.key === previewKey ? { ...current, pending: true, error: '' } : current
    )
    try {
      await ignoreMobileWorktreeCreationLocally({
        client: args.client,
        repoId: args.repo.id,
        name: args.name,
        baseBranch,
        explicitCreation
      })
      await previewNow()
    } catch (cause) {
      setInspection((current) =>
        current?.key === previewKey
          ? {
              ...current,
              error: cause instanceof Error ? cause.message : 'Could not add local ignore rule.'
            }
          : current
      )
    } finally {
      setInspection((current) =>
        current?.key === previewKey ? { ...current, pending: false } : current
      )
    }
  }

  return {
    location,
    setLocation,
    layout,
    setLayout,
    customRoot,
    setCustomRoot,
    explicitCreation,
    preview: currentInspection?.preview ?? null,
    error: currentInspection?.error ?? '',
    pending: currentInspection?.pending ?? false,
    previewNow,
    ignoreLocally
  }
}

export type MobileWorktreeLocationState = ReturnType<typeof useMobileWorktreeLocation>

/** Re-previews an explicit location right before create; returns the refusal to show, if any. */
export async function confirmMobileWorktreeLocation(
  state: MobileWorktreeLocationState
): Promise<string | null> {
  if (state.location === 'automatic') {
    return null
  }
  if (!state.explicitCreation || !state.preview) {
    return 'Preview the worktree location before creating it.'
  }
  const currentPreview = await state.previewNow()
  if (!currentPreview) {
    return 'Could not confirm the selected worktree location.'
  }
  return currentPreview.occupyingWorktree || currentPreview.destinationExists
    ? 'The selected branch or destination is already in use.'
    : null
}
