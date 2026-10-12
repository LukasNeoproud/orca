// Orca's interaction overlay on a Codex thread: guidance, the dynamic tool and the MCP fallback.
import type { CodexAppServerConnection } from './codex-app-server-connection'
import { codexInteractionMcpConfig } from './codex-interaction-mcp-config'
import {
  ORCA_INTERACTIVE_UI_INSTRUCTIONS,
  ORCA_INTERACT_DYNAMIC_TOOLS
} from './codex-orca-interaction'

function configuredDeveloperInstructions(value: unknown): string | null | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const config = (value as Record<string, unknown>).config
  if (typeof config !== 'object' || config === null) {
    return undefined
  }
  const instructions = (config as Record<string, unknown>).developer_instructions
  return instructions === null || typeof instructions === 'string' ? instructions : undefined
}

/** Appends Orca's interaction guidance to the configured developer instructions, never replacing them. */
export async function readInteractiveDeveloperInstructions(
  connection: Pick<CodexAppServerConnection, 'request'>,
  cwd: string,
  timeoutMs: number | undefined
): Promise<string | undefined> {
  try {
    const configured = configuredDeveloperInstructions(
      await connection.request('config/read', { cwd }, { timeoutMs })
    )
    if (configured === undefined) {
      return undefined
    }
    return configured
      ? `${configured}

${ORCA_INTERACTIVE_UI_INSTRUCTIONS}`
      : ORCA_INTERACTIVE_UI_INSTRUCTIONS
  } catch {
    // An unreadable or older config API must not make Orca replace instructions it cannot preserve.
    return undefined
  }
}

export function interactiveThreadStartFields(developerInstructions: string | undefined): {
  developerInstructions?: string
  dynamicTools: typeof ORCA_INTERACT_DYNAMIC_TOOLS
} {
  return {
    ...(developerInstructions ? { developerInstructions } : {}),
    dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS
  }
}

/** Resume cannot add dynamic tools, so the interaction MCP rides the thread config instead. */
export function interactionResumeConfig(
  threadConfig: Record<string, unknown> | undefined,
  bridgeEnvironment: Parameters<typeof codexInteractionMcpConfig>[0]
): { config?: Record<string, unknown> } {
  const config = { ...threadConfig, ...codexInteractionMcpConfig(bridgeEnvironment) }
  return Object.keys(config).length > 0 ? { config } : {}
}
