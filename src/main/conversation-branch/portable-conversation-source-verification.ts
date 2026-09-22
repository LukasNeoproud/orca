import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { PortableConversationSource } from '../../shared/portable-conversation-source'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { IFilesystemProvider } from '../providers/types'

export type PortableConversationSourceFailureCode =
  | 'source_unavailable'
  | 'source_changed'
  | 'transcript_unreadable'
  | 'anchor_not_found'
  | 'anchor_not_assistant'
  | 'anchor_not_user'
  | 'turn_completion_unverifiable'
  | 'selected_text_mismatch'
  | 'history_limit'

export class PortableConversationSourceError extends Error {
  constructor(
    readonly code: PortableConversationSourceFailureCode,
    message: string
  ) {
    super(message)
  }
}

export async function verifyPortableConversationSource(
  source: PortableConversationSource,
  dependencies: {
    listSessions: (source: PortableConversationSource) => Promise<readonly AiVaultSession[]>
    getFilesystemProvider: (host: `ssh:${string}`) => IFilesystemProvider | null
  }
): Promise<{ session: AiVaultSession; provider: IFilesystemProvider }> {
  const sessions = await dependencies.listSessions(source)
  const session = sessions.find(
    (candidate) =>
      candidate.executionHostId === source.executionHostId &&
      candidate.agent === source.provider.agent &&
      candidate.sessionId === source.provider.sessionId &&
      candidate.filePath === source.transcriptPath &&
      !!candidate.cwd &&
      isPathInsideOrEqual(source.workspace.path, candidate.cwd)
  )
  if (!session) {
    throw new PortableConversationSourceError(
      'source_unavailable',
      'The selected conversation is no longer verified on that SSH workspace.'
    )
  }
  const provider = dependencies.getFilesystemProvider(source.executionHostId)
  if (!provider) {
    throw new PortableConversationSourceError(
      'source_unavailable',
      'The SSH host is unavailable; the source conversation was not read locally.'
    )
  }
  return { session, provider }
}
