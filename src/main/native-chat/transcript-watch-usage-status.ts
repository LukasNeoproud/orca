import { codexContextUsageEqual, codexWeeklyUsageEqual } from '../../shared/codex-context-usage'
import { resolveNativeChatTranscriptAgent } from '../../shared/native-chat-agent-support'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../shared/native-chat-types'
import type { NativeChatUsageStatus } from '../../shared/native-chat-usage-status'
import {
  CodexTranscriptUsageStatusAccumulator,
  enrichCodexTranscriptUsageStatus
} from './codex-transcript-usage-status'

type Append = (
  messages: NativeChatMessage[],
  lifecycle?: NativeChatTurnLifecycle,
  usageStatus?: NativeChatUsageStatus
) => void

export class TranscriptWatchUsageStatus {
  readonly accumulator: CodexTranscriptUsageStatusAccumulator | undefined
  private lastPublished: NativeChatUsageStatus | undefined

  constructor(
    agent: AgentType,
    private readonly filePath: string,
    private readonly append: Append,
    private readonly signal?: AbortSignal
  ) {
    this.accumulator =
      resolveNativeChatTranscriptAgent(agent) === 'codex'
        ? new CodexTranscriptUsageStatusAccumulator()
        : undefined
  }

  observe = (line: string): void => this.accumulator?.observe(line)

  reset(): void {
    this.accumulator?.reset()
  }

  snapshot(): NativeChatUsageStatus | undefined {
    return this.accumulator?.snapshot()
  }

  publishedSnapshot(): NativeChatUsageStatus | undefined {
    const status = this.snapshot()
    this.lastPublished = status
    return status
  }

  async enrich(): Promise<void> {
    if (this.accumulator) {
      await enrichCodexTranscriptUsageStatus(this.filePath, this.accumulator, this.signal)
    }
  }

  emitBatch(messages: NativeChatMessage[]): void {
    this.append(messages, undefined, this.publishedSnapshot())
  }

  emitIfChanged(messages: NativeChatMessage[], lifecycle?: NativeChatTurnLifecycle): void {
    const status = this.snapshot()
    if (messages.length > 0 || lifecycle || !usageStatusEqual(this.lastPublished, status)) {
      this.append(messages, lifecycle, status)
      this.lastPublished = status
    }
  }
}

function usageStatusEqual(
  left: NativeChatUsageStatus | undefined,
  right: NativeChatUsageStatus | undefined
): boolean {
  return (
    codexContextUsageEqual(left?.contextUsage, right?.contextUsage) &&
    codexWeeklyUsageEqual(left?.codexWeeklyUsage, right?.codexWeeklyUsage)
  )
}
