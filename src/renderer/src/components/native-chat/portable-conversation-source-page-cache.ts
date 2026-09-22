import { setWithLRU } from '@/lib/scroll-cache'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceCursor,
  PortableConversationSourceIdentity
} from '../../../../shared/portable-conversation-source'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

const MAX_SOURCE_PAGE_SCOPES = 12
const MAX_CACHED_MESSAGES = 512

type MessageOrigin = {
  cursor: PortableConversationSourceCursor
  identity: PortableConversationSourceIdentity
}

export type PortableConversationSourcePageState = {
  messages: NativeChatMessage[]
  origins: ReadonlyMap<string, MessageOrigin>
  nextCursor: PortableConversationSourceCursor | null
  identity: PortableConversationSourceIdentity | null
  activeAnchor: PortableConversationSourceAnchor | null
  verified: boolean
  loading: boolean
  error: string | null
  completedAssistantMessageIds: ReadonlySet<string>
}

type CachedPageState = Omit<PortableConversationSourcePageState, 'loading' | 'error' | 'verified'>

const cache = new Map<string, CachedPageState>()

export function portableConversationSourcePageCacheKey(input: {
  target: RuntimeClientTarget
  source: PortableConversationSource
  initialAnchor?: PortableConversationSourceAnchor
}): string {
  return JSON.stringify([
    'portable-source-pages',
    input.target,
    input.source,
    input.initialAnchor ?? null
  ])
}

export function emptyPortableConversationSourcePageState(
  initialAnchor?: PortableConversationSourceAnchor
): PortableConversationSourcePageState {
  return {
    messages: [],
    origins: new Map(),
    nextCursor: null,
    identity: null,
    activeAnchor: initialAnchor ?? null,
    verified: false,
    loading: true,
    error: null,
    completedAssistantMessageIds: new Set()
  }
}

export function readPortableConversationSourcePageState(
  key: string
): PortableConversationSourcePageState | null {
  const value = cache.get(key)
  return value
    ? {
        ...value,
        messages: [...value.messages],
        origins: new Map(value.origins),
        // Cached transcript rows are never source proof. A current host read
        // must verify their file identity before they can create an anchor.
        verified: false,
        loading: false,
        error: null,
        completedAssistantMessageIds: new Set(value.completedAssistantMessageIds)
      }
    : null
}

export function writePortableConversationSourcePageState(
  key: string,
  state: PortableConversationSourcePageState
): void {
  if (!state.verified || state.messages.length > MAX_CACHED_MESSAGES) {
    return
  }
  setWithLRU(
    cache,
    key,
    {
      messages: [...state.messages],
      origins: new Map(state.origins),
      nextCursor: state.nextCursor,
      identity: state.identity,
      activeAnchor: state.activeAnchor,
      completedAssistantMessageIds: new Set(state.completedAssistantMessageIds)
    },
    MAX_SOURCE_PAGE_SCOPES
  )
}

export function clearPortableConversationSourcePageCacheForTests(): void {
  cache.clear()
}
