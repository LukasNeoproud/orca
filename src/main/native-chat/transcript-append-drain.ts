import type { NativeChatMessage, NativeChatTurnLifecycle } from '../../shared/native-chat-types'
import { readIncrementalTranscriptMessages } from './transcript-incremental-reader'
import type { IncrementalTranscriptState } from './transcript-incremental-reader'
import type { NativeChatLineDecoder } from './transcript-tail-reader'
import type { NativeChatTurnLifecycleDecoder } from './transcript-turn-lifecycle'
import type { TranscriptWatchUsageStatus } from './transcript-watch-usage-status'

export function createTranscriptAppendDrain(input: {
  filePath: string
  state: IncrementalTranscriptState
  decode: NativeChatLineDecoder
  decodeLifecycle: NativeChatTurnLifecycleDecoder | null
  signal: AbortSignal
  usage: TranscriptWatchUsageStatus
  isClosed: () => boolean
}): () => Promise<void> {
  return async () => {
    let lifecycle: NativeChatTurnLifecycle | undefined
    const remaining = await readIncrementalTranscriptMessages(
      input.filePath,
      input.state,
      input.decode,
      (messages: NativeChatMessage[]) => {
        if (!input.isClosed()) {
          input.usage.emitBatch(messages)
        }
      },
      input.decodeLifecycle ?? undefined,
      (nextLifecycle) => {
        lifecycle = nextLifecycle
      },
      input.signal,
      input.usage.observe
    )
    await input.usage.enrich()
    if (!input.isClosed()) {
      input.usage.emitIfChanged(remaining, lifecycle)
    }
  }
}
