// Branches share their workspace, so a send while a relative is still changing files mixes both
// sets of changes. The guard asks first; nothing here can stop a terminal from sending.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getStructuredAgentSessionStatusFeed,
  type StructuredAgentSessionStatusSnapshot
} from '@/runtime/structured-agent-session-status-feed'
import { structuredAgentSessionDraftScopeKey } from '../native-chat/native-chat-composer-draft-store'
import {
  readNativeChatDraftCache,
  writeNativeChatDraftCache
} from '../native-chat/native-chat-draft-cache'
import { workingConversationBranchRelatives } from '../../../../shared/conversation-branch-relatives'
import type { ConversationBranchRecord } from '../../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

type HeldSend = { text: string; send: () => boolean | 'queued'; relatives: string[] }

export function useConversationBranchSendGuard(args: {
  target: RuntimeClientTarget
  sessionId: string
  worktreeId: string | null
  providerSessionId: string | null
  branches: readonly ConversationBranchRecord[]
}): {
  guardSend: (text: string, send: () => boolean | 'queued') => boolean | 'queued'
  asking: HeldSend | null
  sendNow: () => void
  sendWhenDone: () => void
  cancel: () => void
} {
  const { target, sessionId, worktreeId, providerSessionId, branches } = args
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  const [asking, setAsking] = useState<HeldSend | null>(null)
  const [waiting, setWaiting] = useState<HeldSend | null>(null)
  const relativesOf = useCallback(
    (current: StructuredAgentSessionStatusSnapshot) =>
      providerSessionId && worktreeId
        ? workingConversationBranchRelatives(current, branches, providerSessionId, worktreeId)
        : [],
    [branches, providerSessionId, worktreeId]
  )
  const scopeKey = structuredAgentSessionDraftScopeKey(sessionId)
  // Sends what the composer still holds; one sent or changed meanwhile is the person's call.
  const deliver = useCallback(
    (held: HeldSend) => {
      if (readNativeChatDraftCache(scopeKey) !== held.text) {
        return
      }
      if (held.send() !== false) {
        writeNativeChatDraftCache(scopeKey, '')
      }
    },
    [scopeKey]
  )
  const guardSend = useCallback(
    (text: string, send: () => boolean | 'queued') => {
      const relatives = relativesOf(feed.getSnapshot())
      if (relatives.length === 0) {
        return send()
      }
      setAsking({
        text,
        send,
        relatives: relatives.map(
          ({ name }) => name ?? translate('conversationBranch.original', 'Original conversation')
        )
      })
      return false
    },
    [feed, relativesOf]
  )
  // The held send goes out on the status change that leaves no relative working.
  useEffect(() => {
    if (!waiting) {
      return
    }
    const release = (): void => {
      if (relativesOf(feed.getSnapshot()).length === 0) {
        setWaiting(null)
        deliver(waiting)
      }
    }
    return feed.subscribe(release)
  }, [deliver, feed, relativesOf, waiting])
  const toastId = useRef(`conversation-branch-wait-${sessionId}`)
  useEffect(() => {
    if (!waiting) {
      return
    }
    const id = toastId.current
    toast(
      translate('conversationBranch.waiting', 'Sends when {{value0}} finishes', {
        value0: waiting.relatives.join(', ')
      }),
      {
        id,
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: translate('conversationBranch.cancel', 'Cancel'),
          onClick: () => setWaiting(null)
        }
      }
    )
    return () => {
      toast.dismiss(id)
    }
  }, [waiting])
  return {
    guardSend,
    asking,
    sendNow: () => {
      setAsking(null)
      if (asking) {
        deliver(asking)
      }
    },
    sendWhenDone: () => {
      setAsking(null)
      if (!asking) {
        return
      }
      // A relative may have finished while the dialog was open.
      if (relativesOf(feed.getSnapshot()).length === 0) {
        deliver(asking)
      } else {
        setWaiting(asking)
      }
    },
    cancel: () => setAsking(null)
  }
}
