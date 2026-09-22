import type { AgentType, NativeChatMessage } from '../../../shared/native-chat-types'
import { resolveNativeChatTranscriptAgent } from '../../../shared/native-chat-agent-support'
import { asRecord, extractString, parseJsonObject } from '../../ai-vault/session-scanner-values'
import { boundWorkerTranscriptMessages } from './worker-transcript-payload'

export function workerTranscriptAssistantCompletionCandidateId(
  agent: AgentType,
  line: string,
  message: NativeChatMessage | null,
  filePath: string
): string | null {
  if (
    message?.role !== 'assistant' ||
    !message.blocks.some((block) => block.type === 'text' && block.text.trim().length > 0) ||
    message.blocks.some((block) => block.type === 'tool-call')
  ) {
    return null
  }
  if (resolveNativeChatTranscriptAgent(agent) === 'codex') {
    const record = parseJsonObject(line)
    const payload = asRecord(record?.payload) ?? record
    const item = asRecord(payload?.item)
    const phase = extractString(item?.phase) ?? extractString(payload?.phase)
    if (phase !== undefined && phase !== 'final_answer') {
      return null
    }
  }
  return boundWorkerTranscriptMessages([message], filePath).messages[0]!.id
}
