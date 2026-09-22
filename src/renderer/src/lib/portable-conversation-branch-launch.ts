import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { PortableConversationBranchRecord } from '../../../shared/portable-conversation-branch'
import { launchAgentBackgroundSession } from './launch-agent-background-session'
import { waitForTerminalProviderSession } from './terminal-provider-session-identity'
import { deliverLaunchPromptToAgentTab } from './agent-launch-prompt-delivery'
import {
  branchBeginStartPortableConversation,
  branchCompleteStartPortableConversation
} from './portable-conversation-branch-client'

/** The durable claim precedes every side effect; an uncertain launch is never replayed. */
export async function launchPortableConversationBranch(
  target: RuntimeClientTarget,
  branchId: string,
  attemptId: string
): Promise<PortableConversationBranchRecord> {
  const claim = await branchBeginStartPortableConversation(target, { branchId, attemptId })
  if (!claim.authorized) {
    return claim.branch
  }
  const branch = claim.branch
  const workspace = branch.target.terminal.workspace
  const launched = await launchAgentBackgroundSession({
    agent: branch.target.agent,
    worktreeId: workspace.workspaceId,
    executionHostId: workspace.executionHostId,
    runtimeEnvironmentId: target.kind === 'environment' ? target.environmentId : null,
    title: branch.title,
    launchSource: 'sidebar'
  })
  if (!launched) {
    throw new Error(
      'Conversation launch is unverified. Check the target workspace before proceeding.'
    )
  }
  const separator = launched.paneKey.indexOf(':')
  const receipt = {
    tabId: launched.tabId,
    paneKey: launched.paneKey,
    ptyId: launched.ptyId,
    ...(separator === -1 ? {} : { leafId: launched.paneKey.slice(separator + 1) })
  }
  // Persist navigation before sending; a lost reply leaves a recoverable, non-replayable attempt.
  const saved = await branchCompleteStartPortableConversation(target, {
    branchId,
    attemptId,
    outcome: { kind: 'launched', receipt }
  })
  const delivered = await deliverLaunchPromptToAgentTab({
    tabId: launched.tabId,
    agent: branch.target.agent,
    content: branch.handoff.content,
    submit: true,
    forcePaste: true
  })
  if (!delivered) {
    throw new Error(
      'Conversation delivery is unverified. The handoff will not be sent again automatically.'
    )
  }
  const enrichment = waitForTerminalProviderSession(launched.paneKey, 60_000, {
    agent: branch.target.agent,
    workspaceId: workspace.workspaceId,
    ptyId: launched.ptyId
  }).then(async (providerSession) => {
    if (!providerSession) {
      return null
    }
    return branchCompleteStartPortableConversation(target, {
      branchId,
      attemptId,
      outcome: { kind: 'launched', receipt: { ...receipt, providerSession } }
    })
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const updated = await Promise.race([
      enrichment,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 15_000)
      })
    ])
    return updated?.branch ?? saved.branch
  } finally {
    clearTimeout(timer)
  }
}
