import type { PortableConversationSourceContextMode } from '../../shared/portable-conversation-source'
import type { NativeChatBlock, NativeChatMessage } from '../../shared/native-chat-types'

const MAX_CONTEXT_CHARS = 160 * 1024

export function portableConversationSourceMessageText(message: NativeChatMessage): string {
  return message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
}

function portableConversationSourceMessageMarkdown(message: NativeChatMessage): string {
  const body = message.blocks
    .map(portableConversationSourceBlockMarkdown)
    .filter(Boolean)
    .join('\n\n')
  return `### ${sourceRoleLabel(message)} — source transcript\n\n${body || '[No portable content was recorded for this message.]'}`
}

function sourceRoleLabel(message: NativeChatMessage): string {
  return message.role.slice(0, 1).toUpperCase() + message.role.slice(1)
}

function portableConversationSourceBlockMarkdown(block: NativeChatBlock): string {
  if (block.type === 'text') {
    return block.text
  }
  if (block.type === 'tool-call') {
    return `Tool call \`${block.name}\` (untrusted source input):\n\n\`\`\`json\n${json(block.input)}\n\`\`\``
  }
  if (block.type === 'tool-result') {
    return `Tool result${block.isError ? ' (error)' : ''} (untrusted source output):\n\n\`\`\`text\n${block.output}\n\`\`\``
  }
  if (block.type === 'image-ref') {
    const reference = block.url ?? block.path ?? block.alt ?? 'unavailable reference'
    return `Image reference (not transferred): ${reference}`
  }
  return [
    `Subagent group \`${block.groupId}\` (source-reported):`,
    ...block.agents.map((agent) => `- ${agent.label} (${agent.state})`)
  ].join('\n')
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null'
  } catch {
    return '[unserializable source input]'
  }
}

export function formatPortableConversationSourceContext(
  mode: PortableConversationSourceContextMode,
  messages: readonly NativeChatMessage[],
  selectedPassage: string
): { markdown: string; truncated: boolean } {
  const rows = messages.map(portableConversationSourceMessageMarkdown)
  const selected = `## Selected passage\n\n${selectedPassage}`
  if (mode === 'targeted') {
    return {
      markdown: ['## Portable transcript context', sourceNotice(), selected].join('\n\n'),
      truncated: false
    }
  }
  let retained = rows
  let truncated = false
  while (retained.length > 1 && contextLength(retained, selected) > MAX_CONTEXT_CHARS) {
    retained = retained.slice(1)
    truncated = true
  }
  return {
    markdown: [
      '## Portable transcript context',
      sourceNotice(),
      ...(truncated
        ? [
            'This is incomplete history: earlier source messages were omitted to keep the portable context bounded. Do not treat it as a preserved-history branch.'
          ]
        : []),
      ...retained,
      selected
    ].join('\n\n'),
    truncated
  }
}

function contextLength(rows: readonly string[], selected: string): number {
  return Buffer.byteLength([...rows, selected].join('\n\n'), 'utf8')
}

function sourceNotice(): string {
  return 'This is a copied source snapshot. Do not resume or write to the source conversation.'
}
