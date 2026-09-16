import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from './native-chat-types'
import {
  createNativeChatTranscriptRetention,
  encodeNativeChatTranscriptIdentity
} from './native-chat-transcript-retention'

function message(id: string): NativeChatMessage {
  return { id, role: 'assistant', blocks: [], timestamp: 0, source: 'transcript' }
}

describe('native chat transcript retention', () => {
  it('holds only the latest settled transcript for the same identity while unsettled', () => {
    const retention = createNativeChatTranscriptRetention()
    const first = [message('first')]
    const second = [message('second')]

    retention.capture('source-a', first)
    expect(retention.visible({ identity: 'source-a', messages: [], settled: false })).toBe(first)
    expect(retention.visible({ identity: 'source-b', messages: [], settled: false })).toEqual([])

    retention.capture('source-b', second)
    expect(retention.visible({ identity: 'source-a', messages: [], settled: false })).toEqual([])
    expect(retention.visible({ identity: 'source-b', messages: [], settled: false })).toBe(second)
  })

  it('never substitutes retained history for a settled read', () => {
    const retention = createNativeChatTranscriptRetention()
    const retained = [message('retained')]
    const fresh = [message('fresh')]
    retention.capture('source', retained)

    expect(retention.visible({ identity: 'source', messages: fresh, settled: true })).toBe(fresh)
  })

  it('merges live appends over retained history without changing references on rerender', () => {
    const retention = createNativeChatTranscriptRetention()
    retention.capture('source', [message('history')])
    const input = {
      identity: 'source',
      messages: [message('live')],
      settled: false,
      includeUnsettledMessages: true
    }
    const visible = retention.visible(input)
    expect(visible.map((entry) => entry.id)).toEqual(['history', 'live'])
    expect(retention.visible(input)).toBe(visible)
  })

  it('withholds unfenced messages from another source by default', () => {
    const retention = createNativeChatTranscriptRetention()
    retention.capture('old', [message('old')])
    expect(
      retention.visible({ identity: 'new', messages: [message('old')], settled: false })
    ).toEqual([])
  })

  it('encodes identity components without delimiter collisions', () => {
    expect(encodeNativeChatTranscriptIdentity(['host\0workspace', 'session'])).not.toBe(
      encodeNativeChatTranscriptIdentity(['host', 'workspace\0session'])
    )
  })
})
