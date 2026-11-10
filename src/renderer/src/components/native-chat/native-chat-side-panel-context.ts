import { createContext } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { AgentSessionSlashCommand } from '../../../../shared/agent-session-wire'
import type { NativeChatSubagentRow } from '../../../../shared/native-chat-transcript-projection'
import type {
  NativeChatMessage,
  NativeChatSubagentEntry
} from '../../../../shared/native-chat-types'
import type { StructuredAgentContextUsage } from '../../../../shared/structured-agent-session-context-usage'
import type { NativeChatStructuredSessionStatusProps } from './NativeChatStructuredSessionStatus'

export const NATIVE_CHAT_SIDE_PANEL_TABS = [
  'background',
  'plan',
  'subagents',
  'context',
  'artifacts'
] as const
export type NativeChatSidePanelTab = (typeof NATIVE_CHAT_SIDE_PANEL_TABS)[number]

/** What the chat hands the panel; each part comes from the piece of the chat that already holds it. */
export type NativeChatSidePanelFeed = {
  /** The session's own rows, oldest first: where plans, task lists and artifacts are found. */
  conversation?: readonly NativeChatMessage[]
  subagentRows?: ReadonlyMap<string, readonly NativeChatSubagentRow[]>
  /** The transcript's own link handler, so a file named in the panel's rows opens the same way. */
  onLinkClick?: CommentMarkdownLinkClickHandler | undefined
  background?: NativeChatStructuredSessionStatusProps
  contextUsage?: StructuredAgentContextUsage | null
  commands?: readonly AgentSessionSlashCommand[]
}

/** The panel beside a structured chat; absent where none is mounted. */
export type NativeChatSidePanel = {
  tab: NativeChatSidePanelTab | null
  /** The subagent whose own rows the Subagents tab shows. */
  openAgentId: string | null
  /** Opens the panel on a tab, or closes it when no tab is named and it is open. */
  toggle: (tab?: NativeChatSidePanelTab) => void
  /** Opens one subagent's rows; a second call for the same one closes the panel. */
  openSubagent: (entry: NativeChatSubagentEntry) => void
  publish: (part: NativeChatSidePanelFeed) => void
}

export const NativeChatSidePanelContext = createContext<NativeChatSidePanel | undefined>(undefined)
