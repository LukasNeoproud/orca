import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { claudeSessionIdForOrcaSession } from './claude-structured-launch-resolution'
import { forkClaudeStructuredConversation } from './claude-structured-session-fork'
import { fakeClaude } from './claude-structured-session-test-support'

vi.mock('../native-chat/session-file-resolver', () => ({ resolveSessionFilePath: vi.fn() }))

const directories: string[] = []
const SOURCE_PROVIDER_ID = '819cf9f8-e43c-4ad7-b50f-54aa158a726a'

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('forkClaudeStructuredConversation', () => {
  it('opens a clone-only session at the exact transcript boundary without a user turn', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-claude-native-fork-'))
    directories.push(directory)
    const transcriptPath = join(directory, 'source.jsonl')
    await writeFile(
      transcriptPath,
      [
        { sessionId: SOURCE_PROVIDER_ID, uuid: 'user-1', parentUuid: null, type: 'user' },
        {
          sessionId: SOURCE_PROVIDER_ID,
          uuid: 'assistant-1',
          parentUuid: 'user-1',
          type: 'assistant'
        }
      ]
        .map((row) => JSON.stringify(row))
        .join('\n')
    )
    vi.mocked(resolveSessionFilePath).mockResolvedValue(transcriptPath)
    const targetSessionId = 'claude_target_session'
    const targetProviderId = claudeSessionIdForOrcaSession(targetSessionId)
    const claude = fakeClaude({ initSessionId: targetProviderId })

    await expect(
      forkClaudeStructuredConversation({
        request: {
          sourceSessionId: 'source-session',
          targetSessionId,
          targetLocation: {
            executionHostId: 'local',
            wslDistro: null,
            workspaceId: 'target-workspace',
            workspaceKind: 'folder'
          },
          boundaryItemId: agentJournalItemKey({
            provider: 'claude',
            sessionId: SOURCE_PROVIDER_ID,
            uuid: 'assistant-1'
          })
        },
        source: {
          providerSessionId: SOURCE_PROVIDER_ID,
          leafUuid: 'assistant-1',
          claudeConfigDir: '/accounts/claude'
        },
        deps: {
          resolveLaunch: async () => ({
            pathToClaudeCodeExecutable: 'claude',
            options: {},
            cwd: '/source',
            claudeConfigDir: '/accounts/claude',
            providerSessionId: SOURCE_PROVIDER_ID,
            resumeLeafUuid: 'assistant-1',
            resumed: true
          }),
          resolveWorkspacePath: async () => '/target',
          openConnection: claude.openConnection
        }
      })
    ).resolves.toEqual({ providerSessionId: targetProviderId })
    expect(claude.connections[0]?.launch).toMatchObject({
      cwd: '/target',
      options: {
        resume: SOURCE_PROVIDER_ID,
        resumeSessionAt: 'assistant-1',
        forkSession: true,
        sessionId: targetProviderId
      }
    })
    expect(claude.connections[0]?.sent).toEqual([])
    expect(claude.connections[0]?.closed).toBe(true)
  })
})
