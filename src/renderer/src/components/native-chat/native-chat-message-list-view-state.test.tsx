// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { NativeChatMessageList } from './NativeChatMessageList'
import { readNativeChatMessageListViewState } from './native-chat-message-list-view-state'

afterEach(cleanup)

const session: NativeChatLiveSession = {
  messages: [],
  status: 'ready',
  sessionId: 'session-restore',
  agent: 'codex',
  hasMore: false,
  loadingEarlier: false,
  loadEarlier: vi.fn(),
  readPhase: 'ready'
}

describe('NativeChatMessageList view state', () => {
  it('restores the scoped scroll position after the transcript unmounts', () => {
    const first = render(
      <NativeChatMessageList
        session={session}
        isWorking={false}
        expandSignal={false}
        fontScale={1}
        viewStateKey='["local",null,"session-restore"]'
      />
    )
    const firstViewport = first.container.querySelector<HTMLElement>('.overflow-y-auto')!
    Object.defineProperties(firstViewport, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 600 }
    })
    firstViewport.scrollTop = 240
    fireEvent.scroll(firstViewport)
    expect(readNativeChatMessageListViewState('["local",null,"session-restore"]')).toMatchObject({
      scrollTop: 240,
      stuckToBottom: false
    })
    first.unmount()
    const second = render(
      <NativeChatMessageList
        session={session}
        isWorking={false}
        expandSignal={false}
        fontScale={1}
        viewStateKey='["local",null,"session-restore"]'
      />
    )
    expect(second.container.querySelector<HTMLElement>('.overflow-y-auto')!.scrollTop).toBe(240)
  })
})
