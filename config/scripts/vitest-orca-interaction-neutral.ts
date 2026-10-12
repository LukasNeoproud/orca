import { vi } from 'vitest'
import type * as TerminalInteractionLaunch from '../../src/shared/terminal-interaction-launch'

// Orca's interaction MCP rides every local Claude/Codex launch command, while upstream tests pin
// those commands exactly. Neutral here; tests that pin the injection call
// vi.unmock('<path>/terminal-interaction-launch') (see terminal-interaction-launch.test.ts).
vi.mock('../../src/shared/terminal-interaction-launch', async (importOriginal) => ({
  ...(await importOriginal<typeof TerminalInteractionLaunch>()),
  withTerminalInteractionMcp: (command: string) => command
}))

// Upstream Codex tests pin the app-server's own thread params; tests that pin Orca's overlay call
// vi.unmock('<path>/codex-thread-interaction-overlay').
vi.mock(
  '../../src/main/codex/codex-thread-interaction-overlay',
  () => import('../../src/main/codex/codex-thread-interaction-overlay.test-fixture')
)
