import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentSessionBranchNotice,
  AgentSessionBranchProposal
} from '../../../../shared/agent-session-branch-proposal'
import { createStructuredTaskProposal } from '../../../../shared/structured-task-proposal-analysis'
import { latestStructuredTaskProposalSource } from '../../../../shared/structured-task-proposal-source'
import type {
  StructuredTaskProposalBatchRequest,
  StructuredTaskProposalBatchResult
} from '../../../../shared/structured-task-proposal'
import {
  readConversationBranchProposal,
  readConversationBranchNotices,
  readConversationBranchSuggestionPreference,
  writeConversationBranchProposal,
  writeConversationBranchSuggestionPreference
} from '@/lib/structured-conversation-branch-client'
import {
  branchProposalMatchesRequest,
  confirmedAgentSessionBranchProposal,
  newAgentSessionBranchProposal
} from '@/lib/structured-task-proposal-record'
import { prepareStructuredTaskProposalBatch } from '@/lib/structured-task-proposal-batch'
import { conversationBranchError } from '@/lib/conversation-branch-error'
import {
  restoredStructuredTaskProposalResults,
  restoredStructuredTaskProposalNotice,
  structuredTaskProposalForRecord,
  structuredTaskProposalRelatedThreads,
  structuredTaskProposalSourceKey,
  type StructuredTaskProposalHookArgs
} from './structured-task-proposal-view'

export function useStructuredTaskProposals(args: StructuredTaskProposalHookArgs) {
  const [record, setRecord] = useState<AgentSessionBranchProposal | null>(null)
  const [notices, setNotices] = useState<AgentSessionBranchNotice[]>([])
  const [automatic, setAutomatic] = useState(true)
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const analyzed = useRef(new Set<string>())
  const inFlight = useRef(false)
  const refreshFamily = args.refreshFamily
  const source = useMemo(
    () =>
      latestStructuredTaskProposalSource({
        sessionId: args.sessionId,
        workspaceId: args.workspaceId,
        epoch: args.epoch,
        items: args.items
      }),
    [args.epoch, args.items, args.sessionId, args.workspaceId]
  )

  useEffect(() => {
    if (!args.visible) {
      return
    }
    let current = true
    setReady(false)
    setAvailable(false)
    setRecord(null)
    setNotices([])
    void Promise.all([
      readConversationBranchProposal(args.target, args.sessionId),
      readConversationBranchNotices(args.target, args.sessionId),
      readConversationBranchSuggestionPreference(args.target, args.sessionId)
    ])
      .then(([proposal, noticeResult, preference]) => {
        if (!current) {
          return
        }
        setRecord(proposal.proposal)
        setNotices(noticeResult.notices)
        setAutomatic(preference.enabled)
        setError(null)
        setAvailable(true)
        setReady(true)
      })
      .catch((failure) => {
        if (current) {
          setError(conversationBranchError(failure))
          setReady(true)
        }
      })
    return () => {
      current = false
    }
  }, [args.sessionId, args.target, args.visible])

  const saveAnalysis = useCallback(
    async (manual: boolean): Promise<void> => {
      if (!source || inFlight.current) {
        return
      }
      const key = structuredTaskProposalSourceKey(source)!
      const sameSource =
        record?.sourceAnchor.epoch === source.anchor.epoch &&
        record.sourceAnchor.itemId === source.anchor.itemId
      if (sameSource) {
        if (manual && record.state === 'dismissed') {
          const next = {
            ...record,
            revision: record.revision + 1,
            state: 'offered' as const,
            updatedAt: Date.now()
          }
          const saved = await writeConversationBranchProposal(args.target, {
            proposal: next,
            expectedRevision: record.revision
          })
          setRecord(saved.proposal)
        }
        if (manual) {
          setEditorOpen(true)
        }
        analyzed.current.add(key)
        return
      }
      const proposal = createStructuredTaskProposal(source)
      analyzed.current.add(key)
      if (!manual && !proposal.shouldOffer) {
        return
      }
      inFlight.current = true
      setBusy(true)
      try {
        const created = newAgentSessionBranchProposal(proposal, args.agent)
        const saved = await writeConversationBranchProposal(args.target, {
          proposal: created,
          expectedRevision: 0
        })
        setRecord(saved.proposal)
        setError(null)
        if (manual) {
          setEditorOpen(true)
        }
      } catch (failure) {
        setError(conversationBranchError(failure))
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [args.agent, args.target, record, source]
  )

  useEffect(() => {
    const key = structuredTaskProposalSourceKey(source)
    if (
      !ready ||
      !available ||
      !automatic ||
      (args.isWorking && source?.kind === 'review') ||
      !key ||
      analyzed.current.has(key)
    ) {
      return
    }
    void saveAnalysis(false)
  }, [args.isWorking, automatic, available, ready, saveAnalysis, source])

  const dismiss = useCallback(async (): Promise<void> => {
    if (!record || inFlight.current) {
      return
    }
    inFlight.current = true
    setBusy(true)
    try {
      const saved = await writeConversationBranchProposal(args.target, {
        proposal: {
          ...record,
          revision: record.revision + 1,
          state: 'dismissed',
          updatedAt: Date.now()
        },
        expectedRevision: record.revision
      })
      setRecord(saved.proposal)
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [args.target, record])

  const setAutomaticEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      setAutomatic(enabled)
      try {
        const saved = await writeConversationBranchSuggestionPreference(args.target, {
          sessionId: args.sessionId,
          scope: 'session',
          enabled
        })
        setAutomatic(saved.enabled)
      } catch (failure) {
        setAutomatic(!enabled)
        setError(conversationBranchError(failure))
      }
    },
    [args.sessionId, args.target]
  )

  const prepareBatch = useCallback(
    async (
      request: StructuredTaskProposalBatchRequest
    ): Promise<StructuredTaskProposalBatchResult> => {
      if (!record) {
        throw new Error('The durable proposal is unavailable.')
      }
      let confirmed = record
      if (record.state !== 'confirmed') {
        const next = confirmedAgentSessionBranchProposal(record, request, args.agent)
        try {
          confirmed = (
            await writeConversationBranchProposal(args.target, {
              proposal: next,
              expectedRevision: record.revision
            })
          ).proposal
        } catch (failure) {
          const recovered = (
            await readConversationBranchProposal(args.target, args.sessionId).catch(() => null)
          )?.proposal
          if (
            !recovered ||
            recovered.state !== 'confirmed' ||
            !branchProposalMatchesRequest(recovered, request)
          ) {
            throw failure
          }
          confirmed = recovered
        }
        setRecord(confirmed)
      } else if (!branchProposalMatchesRequest(record, request)) {
        throw new Error(
          'The confirmed proposal differs from this retry. Reopen the saved proposal.'
        )
      }
      const result = await prepareStructuredTaskProposalBatch({
        target: args.target,
        proposal: confirmed,
        request
      })
      const refreshedNotices = await readConversationBranchNotices(
        args.target,
        args.sessionId
      ).catch(() => null)
      if (refreshedNotices) {
        setNotices(refreshedNotices.notices)
      }
      refreshFamily()
      return result
    },
    [args.agent, args.sessionId, args.target, record, refreshFamily]
  )

  const proposal = structuredTaskProposalForRecord({
    record,
    source,
    sessionId: args.sessionId,
    workspaceId: args.workspaceId
  })
  return {
    proposal,
    proposalState: record?.state ?? null,
    automatic,
    busy,
    error,
    editorOpen,
    setEditorOpen,
    analyze: () => saveAnalysis(true),
    dismiss,
    setAutomaticEnabled,
    prepareBatch,
    sourceLocation: record?.sourceLocation ?? null,
    relatedThreads: structuredTaskProposalRelatedThreads(args.sessionId, args.family),
    initialResults: restoredStructuredTaskProposalResults(record, args.family),
    initialSourceNotice: restoredStructuredTaskProposalNotice(record, args.family, notices)
  }
}
