import { describe, expect, it, vi } from 'vitest'
import {
  hasAgentComposerRule,
  isAgentComposerProvablyEmpty,
  isClaudeComposerEmpty,
  readSnapshotCursorContext,
  type AgentComposerRuntime
} from './quality-gate-agent-composer'
import {
  COMPOSER_TRANSCRIPT_DRAFT,
  COMPOSER_TRANSCRIPTS,
  finalComposerScreen,
  replayComposerTranscript,
  type ComposerTranscriptName
} from './quality-gate-agent-composer-transcripts'

const emptyOn = async (name: ComposerTranscriptName, extraInput = ''): Promise<boolean> =>
  isClaudeComposerEmpty(
    await readSnapshotCursorContext(await finalComposerScreen(name, extraInput))
  )

function runtimeShowing(snapshot: Awaited<ReturnType<typeof finalComposerScreen>> | null) {
  const serializeAuthoritativeTerminalBuffer = vi.fn(async () => snapshot)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the reader uses only this one member.
  const runtime = { serializeAuthoritativeTerminalBuffer } as unknown as AgentComposerRuntime
  return { runtime, serializeAuthoritativeTerminalBuffer }
}

describe("Claude Code's input field on captured runs", () => {
  it('reads as empty after a permission dialog was confirmed and nothing else was typed', async () => {
    // The run ends with Claude Code's own dimmed suggestion in the field, which nobody typed.
    const screen = await finalComposerScreen(COMPOSER_TRANSCRIPTS.permissionConfirmed)
    const context = await readSnapshotCursorContext(screen)
    expect(context?.rawAfterCursor.trim()).not.toBe('')
    expect(isClaudeComposerEmpty(context)).toBe(true)
  })

  it('does not read as empty with a draft typed before the dialog was confirmed', async () => {
    expect(await emptyOn(COMPOSER_TRANSCRIPTS.draftBeforePermission)).toBe(false)
  })

  it('does not read as empty with a draft typed after the dialog was confirmed', async () => {
    expect(await emptyOn(COMPOSER_TRANSCRIPTS.draftAfterPermission)).toBe(false)
  })

  it.each([COMPOSER_TRANSCRIPTS.draftBeforePermission, COMPOSER_TRANSCRIPTS.draftAfterPermission])(
    'never reads as empty on a frame of %s that shows the draft',
    async (name) => {
      let framesWithDraft = 0
      for await (const frame of replayComposerTranscript(name)) {
        if (!frame.lines.some((line) => line.includes(COMPOSER_TRANSCRIPT_DRAFT))) {
          continue
        }
        framesWithDraft += 1
        expect(isClaudeComposerEmpty(await readSnapshotCursorContext(frame.snapshot))).toBe(false)
      }
      expect(framesWithDraft).toBeGreaterThan(0)
    }
  )

  it('never reads as empty while the permission dialog owns the screen', async () => {
    let dialogFrames = 0
    for await (const frame of replayComposerTranscript(COMPOSER_TRANSCRIPTS.permissionConfirmed)) {
      if (!frame.lines.some((line) => line.includes('Do you want to proceed?'))) {
        continue
      }
      dialogFrames += 1
      expect(isClaudeComposerEmpty(await readSnapshotCursorContext(frame.snapshot))).toBe(false)
    }
    expect(dialogFrames).toBeGreaterThan(0)
  })

  it('does not read as empty with the cursor moved in front of the draft', async () => {
    // Ctrl+A on the captured draft: the typed text now follows the cursor.
    const context = await readSnapshotCursorContext(
      await finalComposerScreen(COMPOSER_TRANSCRIPTS.draftAfterPermission, '\x1b[3G')
    )
    expect(context?.afterCursor).toContain(COMPOSER_TRANSCRIPT_DRAFT)
    expect(isClaudeComposerEmpty(context)).toBe(false)
  })

  it('does not read as empty with the cursor hidden or without a screen', async () => {
    expect(await emptyOn(COMPOSER_TRANSCRIPTS.permissionConfirmed, '\x1b[?25l')).toBe(false)
    expect(isClaudeComposerEmpty(null)).toBe(false)
  })
})

describe('the input field of an agent on this host', () => {
  it('is provably empty only for an agent with a captured rule', async () => {
    const screen = await finalComposerScreen(COMPOSER_TRANSCRIPTS.permissionConfirmed)
    const claude = runtimeShowing(screen)
    expect(await isAgentComposerProvablyEmpty(claude.runtime, 'claude', 'pty-1')).toBe(true)
    expect(claude.serializeAuthoritativeTerminalBuffer).toHaveBeenCalledWith('pty-1', {
      scrollbackRows: 0
    })

    // Codex has no captured transcript of this state, so its screen is not even read.
    const other = runtimeShowing(screen)
    for (const agentType of ['codex', 'gemini', 'constructor', undefined]) {
      expect(hasAgentComposerRule(agentType)).toBe(false)
      expect(await isAgentComposerProvablyEmpty(other.runtime, agentType, 'pty-1')).toBe(false)
    }
    expect(other.serializeAuthoritativeTerminalBuffer).not.toHaveBeenCalled()
  })

  it('is not provably empty when the host has no screen or cannot read it', async () => {
    expect(await isAgentComposerProvablyEmpty(runtimeShowing(null).runtime, 'claude', 'p')).toBe(
      false
    )
    const blank = runtimeShowing({ data: '', cols: 100, rows: 30 })
    expect(await isAgentComposerProvablyEmpty(blank.runtime, 'claude', 'p')).toBe(false)
    const failing = runtimeShowing(null)
    failing.serializeAuthoritativeTerminalBuffer.mockRejectedValueOnce(new Error('gone'))
    expect(await isAgentComposerProvablyEmpty(failing.runtime, 'claude', 'p')).toBe(false)
  })
})
