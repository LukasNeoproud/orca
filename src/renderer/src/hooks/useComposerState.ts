import { getLinkedWorkItemBranchSuggestion } from '@/lib/linked-work-item-branch-suggestion'
import type { SimplifiedWorktreeSubmission } from '@/lib/simplified-worktree-submission'
import type { RefObject } from 'react'
import '@/lib/new-workspace'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { TaskSourceContext, WorkspaceRunContext } from '../../../shared/task-source-context'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '../../../shared/workspace-source'
import type { WorkspaceStatus } from '../../../shared/worktree/types'
import { buildComposerCardProps } from './composer-state/composer-card-props'
import {
  canResolveFolderSmartGitHubSubmit,
  getInitialAutoManagedWorkspaceName,
  getInitialGitHubPrStartPointSelection,
  getMatchingLinkedTaskSourceContext,
  isExplicitWorkspaceNameInput,
  resolveInitialWorkspaceRunSeed,
  resolveSmartGitHubCreateNames,
  retargetGitHubPrStartPointSelection,
  type ComposerDecisions
} from './composer-state/composer-decisions'
import { useComposerTargetState } from './composer-state/composer-target-state'
import { useComposerExternalSync } from './composer-state/composer-external-sync'
import { useComposerSourceState } from './composer-state/composer-source-state'
import { useComposerSubmitOrchestration } from './composer-state/composer-submit-orchestration'
import { assembleComposerModel } from './composer-state/assemble-composer-model'
import type {
  ComposerCardActionProps,
  ComposerCardSourceProps
} from './composer-state/composer-card-contract'
import type { ComposerBackgroundWorktreeCreationCallbacks } from './composer-state/composer-background-worktree-creation'

export {
  canResolveFolderSmartGitHubSubmit,
  getInitialAutoManagedWorkspaceName,
  getInitialGitHubPrStartPointSelection,
  getMatchingLinkedTaskSourceContext,
  isExplicitWorkspaceNameInput,
  resolveInitialWorkspaceRunSeed,
  resolveSmartGitHubCreateNames,
  retargetGitHubPrStartPointSelection
} from './composer-state/composer-decisions'
export type { InitialWorkspaceRunSeedInput } from './composer-state/composer-decisions'

export type UseComposerStateOptions = {
  initialRepoId?: string
  initialEphemeralVmRecipeId?: string
  initialProjectGroupId?: string
  initialName?: string
  initialPrompt?: string
  initialLinkedWorkItem?: LinkedWorkItemSummary | null
  initialGitHubWorkItem?: GitHubWorkItem | null
  initialTaskSourceContext?: TaskSourceContext | null
  initialWorkspaceRunContext?: WorkspaceRunContext | null
  initialWorkspaceStatus?: WorkspaceStatus
  initialBaseBranch?: string
  persistDraft: boolean
  onCreated?: () => void
  backgroundCreationCallbacks?: ComposerBackgroundWorktreeCreationCallbacks
  isSubmissionCancelled?: () => boolean
  repoIdOverride?: string
  onRepoIdOverrideChange?: (value: string) => void
  telemetrySource?: WorkspaceCreateTelemetrySource
  enableIssueAutomation?: boolean
}

export type ComposerCardProps = ComposerCardSourceProps & ComposerCardActionProps

export type UseComposerStateResult = {
  cardProps: ComposerCardProps
  composerRef: RefObject<HTMLDivElement | null>
  onComposerNodeChange: (node: HTMLDivElement | null) => void
  promptTextareaRef: RefObject<HTMLTextAreaElement | null>
  nameInputRef: RefObject<HTMLInputElement | null>
  submitQuick: (agent: TuiAgent | null, explicit?: SimplifiedWorktreeSubmission) => Promise<void>
  createDisabled: boolean
  suggestedBranchName?: string
  selectedBaseBranch?: string
  selectAddedProjectRepo: (repoId: string) => void
}

const COMPOSER_DECISIONS: ComposerDecisions = {
  canResolveFolderSmartGitHubSubmit,
  getInitialAutoManagedWorkspaceName,
  getInitialGitHubPrStartPointSelection,
  getMatchingLinkedTaskSourceContext,
  isExplicitWorkspaceNameInput,
  resolveInitialWorkspaceRunSeed,
  resolveSmartGitHubCreateNames,
  retargetGitHubPrStartPointSelection
}

export function useComposerState(options: UseComposerStateOptions): UseComposerStateResult {
  const target = useComposerTargetState(options, COMPOSER_DECISIONS)
  const external = useComposerExternalSync(target)
  const source = useComposerSourceState(target, external)
  const submit = useComposerSubmitOrchestration(target, external, source)
  const model = assembleComposerModel(target, external, source, submit)
  const builtCard = buildComposerCardProps(model)
  const cardProps: ComposerCardProps = builtCard.cardProps
  const { createDisabled } = builtCard
  return {
    cardProps,
    composerRef: model.composerRef,
    onComposerNodeChange: model.handleComposerNodeChange,
    promptTextareaRef: model.promptTextareaRef,
    nameInputRef: model.nameInputRef,
    submitQuick: model.submitQuick,
    createDisabled,
    suggestedBranchName: getLinkedWorkItemBranchSuggestion(
      model.linkedWorkItem,
      model.branchNameOverride
    ),
    selectedBaseBranch: model.baseBranch,
    selectAddedProjectRepo: model.selectAddedProjectRepo
  }
}
