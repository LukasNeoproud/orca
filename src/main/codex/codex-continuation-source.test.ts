import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectCodexContinuationSource,
  inspectCodexContextSource,
  writeCodexContinuationReference,
  type ResolvedCodexContinuationSource
} from './codex-continuation-source'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

async function fixture(): Promise<{
  root: string
  source: ResolvedCodexContinuationSource
  transcript: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'orca-codex-continuation-source-'))
  roots.push(root)
  const codexHome = join(root, 'codex-home')
  const transcript = join(
    codexHome,
    'sessions',
    '2026',
    '09',
    '22',
    'rollout-2026-09-22T10-00-00-source-session.jsonl'
  )
  await mkdir(dirname(transcript), { recursive: true })
  const cwd = join(root, 'workspace')
  await mkdir(cwd)
  await writeFile(
    transcript,
    [
      line({
        timestamp: '2026-09-22T10:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'source-session', cwd, thread_source: 'user' }
      }),
      line({
        timestamp: '2026-09-22T10:00:01.000Z',
        type: 'event_msg',
        payload: { type: 'task_started', turn_id: 'turn-1' }
      }),
      line({
        timestamp: '2026-09-22T10:00:01.100Z',
        type: 'turn_context',
        payload: { turn_id: 'turn-1', cwd }
      }),
      line({
        timestamp: '2026-09-22T10:00:02.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [] }
      }),
      line({
        timestamp: '2026-09-22T10:00:03.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 'turn-1', completed_at: 1_790_070_403 }
      })
    ].join('')
  )
  return {
    root,
    transcript,
    source: {
      providerSessionId: 'source-session',
      workspaceId: 'workspace-1',
      cwd,
      transcriptPath: transcript,
      codexHome
    }
  }
}

describe('Codex continuation source inspection', () => {
  it('does not treat a completed turn as proof that malformed steering was absent', async () => {
    const { source, transcript } = await fixture()
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}{invalid-json}\n${line({
        timestamp: '2026-09-22T10:01:00.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 'turn-1' }
      })}`
    )
    expect(await inspectCodexContextSource(source)).toMatchObject({
      turnState: 'completed',
      activityReliable: false
    })
  })
  it('pins the requesting turn and counts steering input independently of tool output', async () => {
    const { source, transcript } = await fixture()
    const append = async (payload: unknown, type = 'event_msg') =>
      writeFile(
        transcript,
        `${await readFile(transcript, 'utf8')}${line({ timestamp: '2026-09-22T10:02:00.000Z', type, payload })}`
      )
    await append({ type: 'task_started', turn_id: 'requesting-turn' })
    await append({ type: 'user_message', message: 'Do work' })
    const running = await inspectCodexContextSource(source)
    expect(running).toMatchObject({
      turnId: 'requesting-turn',
      turnState: 'running',
      userMessageCount: 1,
      checkpoint: null
    })
    await append({ type: 'function_call_output', output: 'queued' }, 'response_item')
    expect((await inspectCodexContextSource(source)).userMessageCount).toBe(1)
    await append({ type: 'user_message', message: 'Stop or change scope' })
    expect((await inspectCodexContextSource(source)).userMessageCount).toBe(2)
    await append({ type: 'turn_aborted', turn_id: 'requesting-turn' })
    expect((await inspectCodexContextSource(source)).turnState).toBe('interrupted')
  })
  it('returns only a completed turn at the current transcript frontier', async () => {
    const { source, transcript } = await fixture()
    const completed = await inspectCodexContinuationSource(source)
    expect(completed.checkpoint).toMatchObject({ lastTurnId: 'turn-1' })

    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({
        timestamp: '2026-09-22T10:01:00.000Z',
        type: 'event_msg',
        payload: { type: 'task_started', turn_id: 'turn-2' }
      })}`
    )
    expect((await inspectCodexContinuationSource(source)).checkpoint).toBeNull()

    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({
        timestamp: '2026-09-22T10:01:04.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 'turn-2', completed_at: 1_790_070_464 }
      })}`
    )
    expect((await inspectCodexContinuationSource(source)).checkpoint).toMatchObject({
      lastTurnId: 'turn-2'
    })

    await writeFile(transcript, `${await readFile(transcript, 'utf8')}{"type":"response_item"`)
    expect((await inspectCodexContinuationSource(source)).checkpoint).toBeNull()
  })

  it('bounds an oversized unfinished record and treats it as an uncertain frontier', async () => {
    const { source, transcript } = await fixture()
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${'x'.repeat(2 * 1024 * 1024)}`
    )
    expect((await inspectCodexContinuationSource(source)).checkpoint).toBeNull()
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a rollout symlink that escapes the resolved Codex sessions root',
    async () => {
      const { source, root } = await fixture()
      const outside = join(root, 'outside.jsonl')
      await writeFile(outside, await readFile(source.transcriptPath))
      await rm(source.transcriptPath)
      await symlink(outside, source.transcriptPath)
      await expect(inspectCodexContinuationSource(source)).rejects.toThrow(
        'conversation_continuation_transcript_untrusted'
      )
    }
  )

  it('exports an immutable exact prefix ending at the completion evidence', async () => {
    const { source, root, transcript } = await fixture()
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({
        type: 'event_msg',
        payload: { type: 'token_count', info: {} }
      })}`
    )
    const inspected = await inspectCodexContinuationSource(source)
    const checkpoint = inspected.checkpoint!
    const before = await readFile(transcript, 'utf8')
    const result = await writeCodexContinuationReference({
      userDataPath: root,
      source: { providerSessionId: source.providerSessionId, workspaceId: source.workspaceId },
      resolved: source,
      checkpoint,
      checkpointByteOffset: inspected.checkpointByteOffset!
    })
    const target = result.reference
      .split('\n', 1)[0]!
      .replace('Historical Codex transcript (read-only): ', '')
    expect(await readFile(target, 'utf8')).not.toContain('token_count')
    expect(await readFile(transcript, 'utf8')).toBe(before)
    expect(result.reference).toContain('do not automatically continue the prior task')
  })
})
