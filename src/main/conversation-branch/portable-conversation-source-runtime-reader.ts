import { getSshTargetIdForExecutionHost } from '../../shared/execution-host'
import type { PortableConversationSource } from '../../shared/portable-conversation-source'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { scanSshAiVaultSessions } from '../ai-vault/ssh-session-list'
import {
  createPortableConversationSourceReader,
  type PortableConversationSourceReaderDependencies
} from './portable-conversation-source-reader'

/**
 * The controlling runtime owns only its registered SSH connections.
 * Paired runtimes pass their own dependencies to `createPortableConversationSourceReader`.
 */
export function createRuntimeSshPortableConversationSourceReader() {
  return createPortableConversationSourceReader(runtimeSshSourceReaderDependencies())
}

export function runtimeSshSourceReaderDependencies(): PortableConversationSourceReaderDependencies {
  return {
    listSessions: async (source) => {
      const targetId = sshTargetId(source)
      const result = await scanSshAiVaultSessions(targetId, {
        scopePaths: [source.workspace.path],
        unlimited: true
      })
      return result.sessions
    },
    getFilesystemProvider: (executionHostId) => {
      const targetId = getSshTargetIdForExecutionHost(executionHostId)
      return targetId ? (getSshFilesystemProvider(targetId) ?? null) : null
    }
  }
}

function sshTargetId(source: PortableConversationSource): string {
  const targetId = getSshTargetIdForExecutionHost(source.executionHostId)
  if (!targetId) {
    throw new Error('portable_conversation_source_requires_ssh_host')
  }
  return targetId
}
