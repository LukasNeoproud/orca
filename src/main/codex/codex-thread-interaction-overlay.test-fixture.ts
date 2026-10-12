// Upstream Codex tests pin the app-server's own thread params; Orca's interaction overlay is
// pinned in codex-structured-thread-open-interaction.test.ts. Use with:
//   vi.mock('./codex-thread-interaction-overlay', () => import('./codex-thread-interaction-overlay.test-fixture'))
export const readInteractiveDeveloperInstructions = async (): Promise<undefined> => undefined

export const interactiveThreadStartFields = (): Record<string, never> => ({})

export const interactionResumeConfig = (
  threadConfig: Record<string, unknown> | undefined
): { config?: Record<string, unknown> } => (threadConfig ? { config: threadConfig } : {})
