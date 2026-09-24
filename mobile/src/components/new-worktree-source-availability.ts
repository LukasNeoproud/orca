import type { SmartModeAvailabilityInput } from '../tasks/mobile-smart-source-modes'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'

export function getNewWorktreeSourceAvailability(
  repo: MobileWorkspaceRepo | null,
  tasksSupported: boolean,
  availableProviders: readonly string[]
): SmartModeAvailabilityInput {
  return {
    textOnly: repo?.kind === 'folder',
    tasksSupported,
    hasRepo: repo !== null,
    githubAvailable: availableProviders.includes('github'),
    gitlabAvailable: availableProviders.includes('gitlab'),
    linearAvailable: availableProviders.includes('linear')
  }
}
