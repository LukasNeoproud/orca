import type { WorktreeCheckoutWarning } from '../../../src/shared/worktree/checkout-warning'
import type { WorkspaceCreateSetupDecision } from '../tasks/workspace-create-params'
import type { SetupTrustPrompt } from './SetupHookTrustDrawer'

export type {
  PersistedTrustedOrcaHooks,
  SetupAgentStartupPolicy
} from '../../../src/shared/orca-yaml-hook-types'

export type NewWorkspaceCreateOptions = {
  setupOverride?: Exclude<WorkspaceCreateSetupDecision, 'inherit'>
  approvedSetupContentHash?: string
}

export type NewWorkspaceCreatedHandler = (
  worktreeId: string,
  name: string,
  warning?: string,
  checkoutWarning?: WorktreeCheckoutWarning
) => void

export type RecoveredCheckout = {
  worktreeId: string
  name: string
  warning: WorktreeCheckoutWarning
  prompt: string
  note: string
}

export type NewWorkspaceCreateSubmitResult = {
  creating: boolean
  setupTrustPrompt: SetupTrustPrompt | null
  recoveredCheckout: RecoveredCheckout | null
  create: () => Promise<void>
  openRecoveredWorkspace: () => void
  approveSetupTrust: (alwaysTrust: boolean) => Promise<void>
  closeSetupTrust: () => void
  skipSetupTrust: () => void
}
