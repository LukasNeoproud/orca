import { useCallback, useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import type {
  AgentSessionBranchesResult,
  AgentSessionBranchRecord
} from '../../../src/shared/agent-session-branch'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  newMobileConversationBranchOperationId,
  prepareMobileConversationBranch,
  previewMobileConversationBranch,
  readMobileConversationFamily,
  startMobileConversationBranch
} from './mobile-conversation-branch-rpc'
import {
  buildMobileConversationBranchIntent,
  initialMobileConversationBranchDraft,
  mobileConversationBranchDraftFromIntent,
  type MobileConversationBranchDraft,
  type MobileConversationBranchWorkspace
} from './mobile-conversation-branch-model'
import { mobileConversationBranchError } from './mobile-conversation-branch-error'
import { mobileConversationBranchWorkspaces } from './mobile-conversation-branch-workspaces'
import {
  readMobileConversationBranchIntent,
  resolveMobileConversationBranchIntent,
  retainMobileConversationBranchIntent
} from './mobile-conversation-branch-intent-registry'
import {
  consumeMobileConversationAnchor,
  requestMobileConversationAnchor,
  useMobileConversationAnchorRequest
} from './mobile-conversation-anchor-request'
import { revealMobileStructuredAgentSession } from './mobile-structured-agent-session-launch'

type BranchSelection = {
  scope: string
  key: string
  itemId: string
  preview: Awaited<ReturnType<typeof previewMobileConversationBranch>>
  workspaces: MobileConversationBranchWorkspace[]
  draft: MobileConversationBranchDraft
  attempted: boolean
  branch: AgentSessionBranchRecord | null
}

const EMPTY_FAMILY: AgentSessionBranchesResult = { branches: [], returns: [] }

function messageText(message: NativeChatMessage): string {
  return message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
}

export function useMobileConversationBranching(args: {
  client: RpcClient | null
  connected: boolean
  enabled: boolean
  hostId: string
  sourceSessionId: string | null
  epoch: string | null
  branchableMessageIds: ReadonlySet<string>
}) {
  const { branchableMessageIds, client, connected, enabled, epoch, hostId, sourceSessionId } = args
  const scope = JSON.stringify([hostId, sourceSessionId])
  const [supportedClient, setSupportedClient] = useState<RpcClient | null>(null)
  const supported = supportedClient === client && connected && enabled
  const [family, setFamily] = useState(EMPTY_FAMILY)
  const [familyScope, setFamilyScope] = useState('')
  const [familyVisible, setFamilyVisible] = useState(false)
  const [selection, setSelection] = useState<BranchSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const actionInFlight = useRef(false)
  const startIds = useRef(new Map<string, string>())
  const anchorRequest = useMobileConversationAnchorRequest(hostId, sourceSessionId)

  useEffect(() => {
    setSupportedClient(null)
    if (!client || !connected || !enabled) {
      return
    }
    return startRuntimeCapabilityProbe(client, (capabilities) => {
      setSupportedClient(
        capabilities.includes(AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY) ? client : null
      )
    })
  }, [client, connected, enabled])

  useEffect(() => {
    if (!supported || !client || !sourceSessionId) {
      setFamily(EMPTY_FAMILY)
      setFamilyScope('')
      return
    }
    let current = true
    void readMobileConversationFamily(client, sourceSessionId).then(
      (result) => {
        if (current) {
          setFamily(result)
          setFamilyScope(scope)
          setSelection((open) => {
            if (!open) {
              return open
            }
            const branchId =
              open.branch?.branchId ?? readMobileConversationBranchIntent(open.key)?.branchId
            const branch = result.branches.find((candidate) => candidate.branchId === branchId)
            return branch ? { ...open, attempted: true, branch } : open
          })
        }
      },
      (failure) => {
        if (current) {
          setError(mobileConversationBranchError(failure))
        }
      }
    )
    return () => {
      current = false
    }
  }, [client, revision, scope, sourceSessionId, supported])

  const run = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlight.current) {
      return
    }
    actionInFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (failure) {
      setError(mobileConversationBranchError(failure))
    } finally {
      actionInFlight.current = false
      setBusy(false)
    }
  }, [])

  const openBranch = useCallback(
    (message: NativeChatMessage) => {
      if (!client || !sourceSessionId || !epoch || !branchableMessageIds.has(message.id)) {
        return
      }
      void run(async () => {
        const preview = await previewMobileConversationBranch(client, {
          sourceSessionId,
          expectedEpoch: epoch,
          sourceItemId: message.id
        })
        const workspaceResponse = await client.sendRequest('worktree.ps', { limit: 10_000 })
        if (!workspaceResponse.ok) {
          throw new Error(workspaceResponse.error.message)
        }
        const rows = (workspaceResponse.result as { worktrees?: Worktree[] }).worktrees ?? []
        const key = JSON.stringify([hostId, sourceSessionId, epoch, message.id])
        const prior = readMobileConversationBranchIntent(key)
        const draft = prior
          ? mobileConversationBranchDraftFromIntent(prior)
          : initialMobileConversationBranchDraft({
              responseText: messageText(message),
              sourceWorkspaceId: preview.sourceLocation.workspaceId,
              preview
            })
        setSelection({
          scope,
          key,
          itemId: message.id,
          preview,
          workspaces: mobileConversationBranchWorkspaces(rows, draft.targetWorkspaceId),
          draft,
          attempted: prior !== null,
          branch: null
        })
      })
    },
    [branchableMessageIds, client, epoch, hostId, run, scope, sourceSessionId]
  )

  const updateDraft = useCallback((patch: Partial<MobileConversationBranchDraft>) => {
    setSelection((current) =>
      current && !current.attempted
        ? { ...current, draft: { ...current.draft, ...patch } }
        : current
    )
  }, [])

  const prepare = useCallback(() => {
    if (!client || !sourceSessionId || !epoch || !selection) {
      return
    }
    const captured = selection
    void run(async () => {
      const intent = retainMobileConversationBranchIntent(captured.key, () =>
        buildMobileConversationBranchIntent({
          sourceSessionId,
          epoch,
          sourceItemId: captured.itemId,
          preview: captured.preview,
          draft: captured.draft
        })
      )
      setSelection((current) =>
        current?.key === captured.key ? { ...current, attempted: true } : current
      )
      try {
        const branch = await prepareMobileConversationBranch(client, intent)
        setSelection((current) =>
          current?.key === captured.key ? { ...current, attempted: true, branch } : current
        )
        if (
          branch.state === 'prepared' ||
          branch.state === 'started' ||
          branch.state === 'failed'
        ) {
          resolveMobileConversationBranchIntent(captured.key, branch.branchId)
        }
      } finally {
        setRevision((value) => value + 1)
      }
    })
  }, [client, epoch, run, selection, sourceSessionId])

  const start = useCallback(
    (branch: AgentSessionBranchRecord) => {
      if (!client || branch.state !== 'prepared') {
        return
      }
      void run(async () => {
        const operationId =
          branch.delivery?.clientMessageId ??
          startIds.current.get(branch.branchId) ??
          newMobileConversationBranchOperationId()
        startIds.current.set(branch.branchId, operationId)
        try {
          const updated = await startMobileConversationBranch({ client, branch, operationId })
          setSelection((current) =>
            current?.branch?.branchId === updated.branchId
              ? { ...current, branch: updated }
              : current
          )
        } finally {
          setRevision((value) => value + 1)
        }
      })
    },
    [client, run]
  )

  const navigate = useCallback(
    (branch: AgentSessionBranchRecord, source: boolean) => {
      if (!client) {
        return
      }
      void run(async () => {
        const sessionId = source ? branch.source.sessionId : branch.target.sessionId
        const location = source ? branch.source.location : branch.target.location
        await revealMobileStructuredAgentSession(client, sessionId)
        if (source) {
          requestMobileConversationAnchor(hostId, sessionId, branch.source.anchor)
        }
        setSelection(null)
        setFamilyVisible(false)
        router.push({
          pathname: '/h/[hostId]/session/[worktreeId]',
          params: { hostId, worktreeId: location.workspaceId }
        })
      })
    },
    [client, hostId, run]
  )

  const draftContent =
    selection?.draft.mode === 'preserve-history'
      ? selection.draft.instruction
      : selection?.draft.content
  const canPrepare = Boolean(
    selection && !selection.branch && selection.draft.title.trim() && draftContent?.trim()
  )

  return {
    supported,
    family: familyScope === scope ? family : EMPTY_FAMILY,
    familyVisible,
    setFamilyVisible,
    selection: selection?.scope === scope ? selection : null,
    setSelection,
    updateDraft,
    openBranch,
    prepare,
    canPrepare,
    start,
    navigate,
    refresh: () => setRevision((value) => value + 1),
    busy,
    error,
    clearError: () => setError(null),
    canBranchMessage: (message: NativeChatMessage) =>
      supported && branchableMessageIds.has(message.id),
    anchorRequest: anchorRequest && anchorRequest.epoch === epoch ? anchorRequest : null,
    consumeAnchor: (sequence: number) => {
      if (sourceSessionId) {
        consumeMobileConversationAnchor(hostId, sourceSessionId, sequence)
      }
    }
  }
}

export type MobileConversationBranchController = ReturnType<typeof useMobileConversationBranching>
