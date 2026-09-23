import type { WorktreeCheckoutWarning } from '../../../src/shared/worktree/checkout-warning'

export function formatMobileCheckoutWarning(warning: WorktreeCheckoutWarning): string {
  const title =
    warning.kind === 'post-checkout-hook-failed'
      ? 'Workspace created, but the checkout hook failed.'
      : 'Workspace created, but Git reported an error after checkout.'
  return `${title}\nAutomatic setup and agent startup were paused.\n${warning.path}\n${warning.message}`
}
