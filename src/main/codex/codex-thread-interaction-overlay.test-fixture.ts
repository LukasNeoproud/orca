// Installed for every test by config/scripts/vitest-orca-interaction-neutral.ts; Orca's overlay is
// pinned in codex-structured-thread-open-interaction.test.ts.
export const readInteractiveDeveloperInstructions = async (): Promise<undefined> => undefined

export const interactiveThreadStartFields = (): Record<string, never> => ({})

export const interactionResumeConfig = (
  threadConfig: Record<string, unknown> | undefined
): { config?: Record<string, unknown> } => (threadConfig ? { config: threadConfig } : {})
