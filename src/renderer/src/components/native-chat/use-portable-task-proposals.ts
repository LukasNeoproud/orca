import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor
} from '../../../../shared/portable-conversation-source'
import type { PortableConversationProposalRecord } from '../../../../shared/portable-conversation-proposal'
import type { StructuredTaskProposalBatchRequest } from '../../../../shared/structured-task-proposal'
import { portableConversationSourceSessionId } from '../../../../shared/portable-conversation-branch'
import { portableProposalClient } from '@/lib/portable-conversation-proposal-client'
import { readPortableConversationBranches } from '@/lib/portable-conversation-branch-client'
import { portableConversationBranchTargetSource } from '@/lib/portable-conversation-navigation'
import {
  preparePortableTaskProposalBatch,
  type PortableTaskProposalBatchIntent
} from '@/lib/portable-task-proposal-batch'
import { conversationBranchError } from '@/lib/conversation-branch-error'
import { translate } from '@/i18n/i18n'
import { portableTaskProposalRecord } from './portable-task-proposal-record'

export type PortableTaskProposalPanelProps = {
  target: RuntimeClientTarget
  source: PortableConversationSource
  messages: readonly NativeChatMessage[]
  anchorFor: (message: NativeChatMessage) => PortableConversationSourceAnchor | null
  onFamilyChanged?: () => void
}
type Snapshot = {
  scope: string
  record: PortableConversationProposalRecord | null
  enabled: boolean
  ready: boolean
  related: ReadonlyMap<string, PortableConversationSource>
  error: string | null
}
const EMPTY = {
  record: null,
  enabled: false,
  ready: false,
  related: new Map<string, PortableConversationSource>(),
  error: null
}

export function usePortableTaskProposals({
  target,
  source,
  messages,
  anchorFor,
  onFamilyChanged
}: PortableTaskProposalPanelProps) {
  const scope = JSON.stringify([target, source])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const [snapshot, setSnapshot] = useState<Snapshot>({ ...EMPTY, scope })
  const state = snapshot.scope === scope ? snapshot : { ...EMPTY, scope }
  const [openScope, setOpenScope] = useState<string | null>(null)
  const [busyScope, setBusyScope] = useState<string | null>(null)
  const inFlight = useRef<string | null>(null)
  const analyzed = useRef(new Set<string>())
  const intent = useRef<PortableTaskProposalBatchIntent | null>(null)
  const candidate =
    messages.findLast((message) => message.role === 'user' || message.role === 'assistant') ?? null
  const update = useCallback(
    (patch: Partial<Snapshot>) => {
      if (currentScope.current === scope) {
        setSnapshot((previous) => ({
          ...(previous.scope === scope ? previous : { ...EMPTY, scope }),
          ...patch
        }))
      }
    },
    [scope]
  )
  const setRecord = useCallback(
    (record: PortableConversationProposalRecord) => update({ record }),
    [update]
  )
  useEffect(() => {
    intent.current = null
  }, [scope, state.record?.proposal.proposalId])
  useEffect(() => {
    let active = true
    update({ ...EMPTY })
    void Promise.all([
      portableProposalClient.get(target, source),
      portableProposalClient.preferenceGet(target, source),
      readPortableConversationBranches(target, {
        sessionId: portableConversationSourceSessionId(source),
        source
      })
    ])
      .then(([saved, preference, family]) => {
        if (active) {
          update({
            record: saved.proposal,
            enabled: preference.preference.enabled,
            ready: true,
            related: new Map(
              family.branches.flatMap((branch) => {
                const destination = portableConversationBranchTargetSource(branch)
                return destination ? [[branch.target.sessionId, destination] as const] : []
              })
            )
          })
        }
      })
      .catch((failure) => {
        if (active) {
          update({ error: conversationBranchError(failure) })
        }
      })
    return () => {
      active = false
    }
  }, [source, target, update])
  const finish = useCallback(() => {
    if (inFlight.current === scope) {
      inFlight.current = null
      setBusyScope(null)
    }
  }, [scope])
  const analyze = useCallback(
    async (manual = true): Promise<void> => {
      if (!candidate || !state.ready || inFlight.current === scope) {
        return
      }
      const anchor = anchorFor(candidate)
      if (!anchor) {
        if (manual) {
          update({
            error: translate(
              'conversations.portableProposal.sourceUnverified',
              'Re-read the selected source message before analysis.'
            )
          })
        }
        return
      }
      const sameAnchor =
        state.record?.portable.anchor.messageId === anchor.messageId &&
        state.record.portable.identity.fingerprint === anchor.identity.fingerprint
      if (sameAnchor) {
        if (manual) {
          setOpenScope(scope)
        }
        return
      }
      const key = JSON.stringify([scope, anchor.identity.fingerprint, anchor.messageId])
      if (!manual && analyzed.current.has(key)) {
        return
      }
      analyzed.current.add(key)
      if (analyzed.current.size > 128) {
        analyzed.current.delete(analyzed.current.values().next().value!)
      }
      inFlight.current = scope
      setBusyScope(scope)
      update({ error: null })
      try {
        const result = await portableProposalClient.analyze(target, {
          source,
          anchor,
          kind: candidate.role === 'user' ? 'prompt' : 'review'
        })
        if (currentScope.current !== scope || (!manual && !result.proposal.shouldOffer)) {
          return
        }
        const previous =
          state.record?.proposal.proposalId === result.proposal.proposalId ? state.record : null
        const saved = await portableProposalClient.put(target, {
          proposal: portableTaskProposalRecord({
            proposal: result.proposal,
            proof: result.proof,
            anchor,
            previous,
            related: state.related
          }),
          expectedRevision: previous?.revision ?? 0
        })
        setRecord(saved.proposal)
        if (manual && currentScope.current === scope) {
          setOpenScope(scope)
        }
      } catch (failure) {
        update({ error: conversationBranchError(failure) })
        const recovered = await portableProposalClient.get(target, source).catch(() => null)
        if (recovered?.proposal) {
          setRecord(recovered.proposal)
        }
      } finally {
        finish()
      }
    },
    [
      anchorFor,
      candidate,
      finish,
      scope,
      setRecord,
      source,
      state.ready,
      state.record,
      state.related,
      target,
      update
    ]
  )
  useEffect(() => {
    if (state.enabled && openScope !== scope) {
      void analyze(false)
    }
  }, [analyze, openScope, scope, state.enabled, busyScope])
  const setAutomatic = async (): Promise<void> => {
    if (!state.ready || inFlight.current === scope) {
      return
    }
    inFlight.current = scope
    setBusyScope(scope)
    try {
      const result = await portableProposalClient.preferenceSet(target, {
        source,
        scope: 'session',
        enabled: !state.enabled
      })
      update({ enabled: result.preference.enabled, error: null })
    } catch (failure) {
      update({ error: conversationBranchError(failure) })
    } finally {
      finish()
    }
  }
  const prepareBatch = async (request: StructuredTaskProposalBatchRequest) => {
    if (!state.record || inFlight.current === scope) {
      throw new Error('portable_conversation_proposal_missing')
    }
    inFlight.current = scope
    setBusyScope(scope)
    try {
      const result = await preparePortableTaskProposalBatch({
        target,
        record: state.record,
        request,
        related: state.related,
        intent,
        onRecord: setRecord
      })
      onFamilyChanged?.()
      return result
    } finally {
      finish()
    }
  }
  return {
    ...state,
    busy: busyScope === scope,
    open: openScope === scope,
    setOpen: (open: boolean) => setOpenScope(open ? scope : null),
    analyze,
    setAutomatic,
    prepareBatch,
    candidate
  }
}
