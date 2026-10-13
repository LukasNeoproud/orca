import type { AgentSessionOptionsResult } from './agent-session-wire'

/** A provider's permission postures for one chat, written back under `optionId`. */
export type AgentSessionPermissionsOption = NonNullable<AgentSessionOptionsResult['permissions']>
