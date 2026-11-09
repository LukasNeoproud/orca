import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  conversationBranchErrorCode,
  conversationBranchOf,
  conversationBranchReturnDraft,
  type ConversationBranchRecord
} from '../../../src/shared/conversation-branch'
import { conversationBranchHasFamily } from '../../../src/shared/conversation-branch-family'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { RpcClient } from '../transport/rpc-client'
import { MobileBranchDrawer, MobileBranchReturnDrawer } from './MobileConversationBranchDrawers'
import { MobileBranchFamilyDrawer } from './MobileConversationBranchFamilyDrawer'
import {
  MobileConversationBranchContext,
  type MobileConversationBranching
} from './mobile-conversation-branch-context'
import {
  listMobileConversationBranches,
  newMobileConversationBranchRequestId,
  openMobileConversationMember,
  returnMobileConversationBranchResult,
  startMobileConversationBranch,
  type MobileConversationBranches,
  type MobileConversationBranchScope
} from './mobile-conversation-branch-launch'
import { nativeChatMessagePlainText } from './mobile-native-chat-message-plain-text'

type Drawer =
  | { kind: 'branch'; message: NativeChatMessage; requestId: string }
  | { kind: 'return'; message: NativeChatMessage; branch: ConversationBranchRecord }
  | { kind: 'family' }

const ERROR_TEXT: Record<string, string> = {
  conversation_branch_source_busy: 'Wait for Claude to finish before branching from this chat.',
  conversation_branch_invalid_anchor: 'This reply cannot be a branch point.',
  conversation_branch_history_missing: 'Claude’s saved conversation was not found on the host.',
  conversation_branch_fork_unverified:
    'Orca could not confirm the branch was created. It will not be created again.',
  conversation_branch_unavailable: 'Branching is not available on this computer.'
}

function errorText(error: unknown): string {
  const code = conversationBranchErrorCode(error)
  const known = code ? ERROR_TEXT[code] : undefined
  return known ?? (error instanceof Error && error.message ? error.message : 'Something failed.')
}

/** Branching for the Claude chat on screen; without host support the chat renders unchanged. */
export function MobileConversationBranchProvider({
  client,
  hostId,
  worktreeId,
  supported,
  chat,
  children
}: {
  client: RpcClient | null
  hostId: string
  worktreeId: string
  supported: boolean
  /** The structured chat on screen. */
  chat: { sessionId: string; agent: string } | null
  children?: ReactNode
}): React.JSX.Element {
  const active = client && supported && chat?.agent === 'claude' ? chat.sessionId : null
  return active && client ? (
    <ActiveBranchProvider scope={{ client, hostId, worktreeId }} sessionId={active}>
      {children}
    </ActiveBranchProvider>
  ) : (
    <>{children}</>
  )
}

function ActiveBranchProvider({
  scope: { client, hostId, worktreeId },
  sessionId,
  children
}: {
  scope: MobileConversationBranchScope
  sessionId: string
  children?: ReactNode
}): React.JSX.Element {
  const scope = useMemo(() => ({ client, hostId, worktreeId }), [client, hostId, worktreeId])
  const [data, setData] = useState<MobileConversationBranches>({ branches: [], chats: [] })
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(
    () =>
      listMobileConversationBranches(scope).then(setData, () => {
        // A failed read keeps what was shown; the next one retries.
      }),
    [scope]
  )
  useEffect(() => {
    void refresh()
  }, [refresh, sessionId])

  const providerSessionId =
    data.chats.find((candidate) => candidate.sessionId === sessionId)?.providerSessionId ?? null
  const ownBranch = providerSessionId
    ? conversationBranchOf(data.branches, providerSessionId)
    : null
  const hasFamily =
    providerSessionId !== null && conversationBranchHasFamily(data.branches, providerSessionId)

  const value = useMemo<MobileConversationBranching>(
    () => ({
      branchFrom: (message) =>
        setDrawer({ kind: 'branch', message, requestId: newMobileConversationBranchRequestId() }),
      ...(ownBranch
        ? { returnFrom: (message) => setDrawer({ kind: 'return', message, branch: ownBranch }) }
        : {}),
      ...(hasFamily ? { openFamily: () => setDrawer({ kind: 'family' }) } : {})
    }),
    [ownBranch, hasFamily]
  )
  const close = (): void => {
    if (!pending) {
      setDrawer(null)
      setError(null)
    }
  }
  const run = (work: () => Promise<void>): void => {
    setPending(true)
    setError(null)
    work()
      .then(() => setDrawer(null))
      .catch((failure: unknown) => setError(errorText(failure)))
      .finally(() => {
        setPending(false)
        void refresh()
      })
  }

  return (
    <MobileConversationBranchContext.Provider value={value}>
      {children}
      {drawer?.kind === 'branch' ? (
        <MobileBranchDrawer
          replyText={nativeChatMessagePlainText(drawer.message)}
          pending={pending}
          error={error}
          onClose={close}
          onCreate={(values) =>
            run(async () => {
              await startMobileConversationBranch(scope, {
                requestId: drawer.requestId,
                sourceSessionId: sessionId,
                itemId: drawer.message.id,
                ...values
              })
            })
          }
        />
      ) : null}
      {drawer?.kind === 'return' ? (
        <MobileBranchReturnDrawer
          initialContent={conversationBranchReturnDraft(
            drawer.branch.label,
            nativeChatMessagePlainText(drawer.message)
          )}
          parentName={
            conversationBranchOf(data.branches, drawer.branch.parent.providerSessionId)?.label ??
            'the original conversation'
          }
          pending={pending}
          error={error}
          onClose={close}
          onReturn={(content) =>
            run(async () => {
              await returnMobileConversationBranchResult(scope, data.chats, drawer.branch, content)
            })
          }
        />
      ) : null}
      {drawer?.kind === 'family' && providerSessionId ? (
        <MobileBranchFamilyDrawer
          branches={data.branches}
          providerSessionId={providerSessionId}
          error={error}
          onClose={close}
          onOpen={(memberId) =>
            run(() => openMobileConversationMember(scope, data.chats, memberId))
          }
        />
      ) : null}
    </MobileConversationBranchContext.Provider>
  )
}
