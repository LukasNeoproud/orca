import { createContext } from 'react'
import type { SlashCommandSuggestion } from '../../../../shared/native-chat-slash-commands'
import type { StructuredAgentSessionCommandOutcome } from '../../../../shared/structured-agent-session-composer'

export type NativeChatHostCommand = (
  argument: string
) => Omit<StructuredAgentSessionCommandOutcome, 'handled'>

/** What a Claude chat answers itself instead of sending to the agent; absent where it cannot. */
export type NativeChatClaudeControls = {
  /** By command name, without the slash. */
  commands: Readonly<Record<string, NativeChatHostCommand>>
  suggestions: readonly SlashCommandSuggestion[]
  /** Moves a running foreground tool call to the background, as Ctrl+B does in the terminal. */
  backgroundTool: (toolUseId: string) => Promise<boolean>
}

export const NativeChatClaudeControlsContext = createContext<NativeChatClaudeControls | undefined>(
  undefined
)
