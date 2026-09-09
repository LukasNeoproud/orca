export type WorktreeCheckoutWarning = {
  kind: 'post-checkout-hook-failed' | 'git-error-after-checkout'
  message: string
  path: string
}
