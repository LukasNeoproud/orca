import {
  normalizeNativeChatTaskList,
  type NativeChatTaskList
} from '../../../../shared/native-chat-task-list'
import {
  isSubagentGroupBlock,
  type NativeChatMessage,
  type NativeChatSubagentEntry
} from '../../../../shared/native-chat-types'
import { parseNativeChatVisualDirectiveLine } from '../../../../shared/native-chat-visual-directive'

// What the side panel reads out of the conversation's own rows. Pure, so the tabs only draw.

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a non-null, non-array object is checked on the line above.
      (value as Record<string, unknown>)
    : null
}

/** The newest plan the agent proposed, and the newest task list it kept. */
export function nativeChatSidePanelPlan(conversation: readonly NativeChatMessage[]): {
  plan: string | null
  tasks: NativeChatTaskList | null
} {
  let plan: string | null = null
  let tasks: NativeChatTaskList | null = null
  for (let index = conversation.length - 1; index >= 0 && (!plan || !tasks); index -= 1) {
    const blocks = conversation[index]!.blocks
    for (let at = blocks.length - 1; at >= 0; at -= 1) {
      const block = blocks[at]!
      if (block.type !== 'tool-call' || block.state === 'failed') {
        continue
      }
      const proposed = block.name === 'ExitPlanMode' ? record(block.input)?.plan : null
      if (!plan && typeof proposed === 'string' && proposed.trim()) {
        plan = proposed
      }
      tasks ??= normalizeNativeChatTaskList(block.name, block.input)
    }
  }
  return { plan, tasks }
}

/** Every subagent the loaded conversation names, in the order it first names each, newest state. */
export function nativeChatSidePanelSubagents(
  conversation: readonly NativeChatMessage[]
): NativeChatSubagentEntry[] {
  const agents = new Map<string, NativeChatSubagentEntry>()
  for (const message of conversation) {
    for (const block of message.blocks) {
      if (isSubagentGroupBlock(block)) {
        for (const agent of block.agents) {
          agents.set(agent.id, agent)
        }
      }
    }
  }
  return [...agents.values()]
}

export type NativeChatSidePanelArtifact =
  | { kind: 'visual'; file: string; title: string | null }
  | { kind: 'link'; url: string }

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:[\w-]+\/)*artifacts?\/[\w-]+/g

/** The visuals the agent drew and the claude.ai artifacts it linked, newest last, each once. */
export function nativeChatSidePanelArtifacts(
  conversation: readonly NativeChatMessage[]
): NativeChatSidePanelArtifact[] {
  const artifacts = new Map<string, NativeChatSidePanelArtifact>()
  for (const message of conversation) {
    if (message.role === 'user') {
      continue
    }
    for (const block of message.blocks) {
      const text =
        block.type === 'text' ? block.text : block.type === 'tool-result' ? block.output : ''
      if (!text) {
        continue
      }
      if (block.type === 'text' && text.includes('::orca-visual{')) {
        for (const line of text.split('\n')) {
          const visual = parseNativeChatVisualDirectiveLine(line)
          if (visual) {
            artifacts.set(`visual:${visual.file}`, { kind: 'visual', ...visual })
          }
        }
      }
      for (const [url] of text.matchAll(ARTIFACT_URL)) {
        artifacts.set(`link:${url}`, { kind: 'link', url })
      }
    }
  }
  return [...artifacts.values()]
}
