import { mergeNativeChatMessages } from './native-chat-merge'
import type { NativeChatMessage } from './native-chat-types'

export const EMPTY_NATIVE_CHAT_TRANSCRIPT: NativeChatMessage[] = []

export function encodeNativeChatTranscriptIdentity(parts: readonly (string | null)[]): string {
  return JSON.stringify(parts)
}

export type NativeChatTranscriptRetention = {
  capture: (identity: string, messages: NativeChatMessage[]) => void
  visible: (args: {
    identity: string
    messages: NativeChatMessage[]
    settled: boolean
    /** Only opt in after fencing messages against the current source generation. */
    includeUnsettledMessages?: boolean
  }) => NativeChatMessage[]
}

/** Retains one settled transcript so a same-source rebind does not blank the conversation. */
export function createNativeChatTranscriptRetention(): NativeChatTranscriptRetention {
  let captured: { identity: string; messages: NativeChatMessage[] } | null = null

  let merged: {
    retained: NativeChatMessage[]
    incoming: NativeChatMessage[]
    messages: NativeChatMessage[]
  } | null = null

  return {
    capture(identity, messages) {
      captured = { identity, messages }
      merged = null
    },
    visible({ identity, messages, settled, includeUnsettledMessages = false }) {
      if (settled) {
        return messages
      }
      // An unsettled read includes a failed one: retained history beats blanking the pane for a transient error.
      const retained =
        captured?.identity === identity ? captured.messages : EMPTY_NATIVE_CHAT_TRANSCRIPT
      if (!includeUnsettledMessages || messages.length === 0) {
        return retained
      }
      if (retained.length === 0) {
        return messages
      }
      if (merged?.retained !== retained || merged.incoming !== messages) {
        merged = {
          retained,
          incoming: messages,
          messages: mergeNativeChatMessages(retained, messages)
        }
      }
      return merged.messages
    }
  }
}
