// Test support: the captured Claude Code runs the composer rule is written against.
import { HeadlessEmulator } from '../daemon/headless-emulator'
import {
  readRuntimeFixture,
  splitTranscriptIntoChunks
} from '../runtime/agent-transcript-replay-test-harness'

export const COMPOSER_TRANSCRIPT_COLS = 100
export const COMPOSER_TRANSCRIPT_ROWS = 30
/** What the user typed and never sent in both draft transcripts. */
export const COMPOSER_TRANSCRIPT_DRAFT = 'my unsent note'

export const COMPOSER_TRANSCRIPTS = {
  /** One permission dialog confirmed with Enter and nothing else typed. */
  permissionConfirmed: 'claude-2-1-329-permission-confirmed',
  draftBeforePermission: 'claude-2-1-329-draft-before-permission',
  draftAfterPermission: 'claude-2-1-329-draft-after-permission'
} as const

export type ComposerTranscriptName =
  (typeof COMPOSER_TRANSCRIPTS)[keyof typeof COMPOSER_TRANSCRIPTS]

type ScreenSnapshot = { data: string; cols: number; rows: number }

function serializedScreen(emulator: HeadlessEmulator): ScreenSnapshot {
  const snapshot = emulator.getSnapshot({ scrollbackRows: 0 })
  return {
    data: snapshot.rehydrateSequences + snapshot.snapshotAnsi,
    cols: snapshot.cols,
    rows: snapshot.rows
  }
}

/** Each frame of the run as the host serializes its screen, with the rows it shows. */
export async function* replayComposerTranscript(
  name: ComposerTranscriptName,
  extraInput = ''
): AsyncGenerator<{ lines: string[]; snapshot: ScreenSnapshot }> {
  const emulator = new HeadlessEmulator({
    cols: COMPOSER_TRANSCRIPT_COLS,
    rows: COMPOSER_TRANSCRIPT_ROWS
  })
  try {
    for (const chunk of [...splitTranscriptIntoChunks(readRuntimeFixture(name)), extraInput]) {
      await emulator.write(chunk)
      yield { lines: emulator.getVisibleLines(), snapshot: serializedScreen(emulator) }
    }
  } finally {
    emulator.dispose()
  }
}

/** The screen the run ended on, optionally with more bytes painted over it. */
export async function finalComposerScreen(
  name: ComposerTranscriptName,
  extraInput = ''
): Promise<ScreenSnapshot> {
  let last: ScreenSnapshot | null = null
  for await (const frame of replayComposerTranscript(name, extraInput)) {
    last = frame.snapshot
  }
  if (!last) {
    throw new Error(`empty fixture ${name}`)
  }
  return last
}
