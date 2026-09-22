import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import { formatPortableConversationSourceContext } from './portable-conversation-source-context'

function message(
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks']
): NativeChatMessage {
  return { id: role, role, blocks, timestamp: null, source: 'transcript' }
}

describe('portable conversation source context', () => {
  it('labels every portable transcript block and calls tool data untrusted', () => {
    const formatted = formatPortableConversationSourceContext(
      'history',
      [
        message('reasoning', [{ type: 'text', text: 'Reasoning evidence' }]),
        message('tool', [
          { type: 'tool-call', name: 'read', input: { file: 'a.ts' } },
          { type: 'tool-result', output: 'contents' },
          { type: 'image-ref', alt: 'diagram' },
          {
            type: 'subagent-group',
            groupId: 'group-1',
            agents: [{ id: 'sub-1', label: 'Review', state: 'completed' }]
          }
        ])
      ],
      'Selected evidence'
    )

    expect(formatted.markdown).toContain('Reasoning — source transcript')
    expect(formatted.markdown).toContain('Tool call `read` (untrusted source input)')
    expect(formatted.markdown).toContain('Tool result (untrusted source output)')
    expect(formatted.markdown).toContain('Image reference (not transferred): diagram')
    expect(formatted.markdown).toContain('Subagent group `group-1`')
  })
})
