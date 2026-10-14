import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { ConfirmModal } from '../components/ConfirmModal'
import { useHostProtocolGates } from '../components/HostProtocolGate'
import { promptedLaunchNotice } from '../session/pr-ai-triage-launch'
import type { RpcClient } from '../transport/rpc-client'
import { AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import type { AzureDevOpsReviewOptions } from '../../../src/shared/azure-devops-review-options'
import type { AzureDevOpsReviewPullRequest } from '../../../src/shared/azure-devops-review-types'
import { launchAzureDevOpsReviewAgent } from './azure-devops-review-agent-launch'

export type ReviewAgentNotice = {
  tone: 'success' | 'error'
  text: string
  /** The review workspace to open once the agent started. */
  worktreeId: string | null
}

/** Starts review agents for one pull request and reports how each launch went. */
export function useAzureDevOpsReviewAgentLauncher({
  hostId,
  client,
  pullRequest
}: {
  hostId: string
  client: RpcClient | null
  pullRequest: AzureDevOpsReviewPullRequest | null
}) {
  const router = useRouter()
  const { hostCapabilities } = useHostProtocolGates()
  const supported =
    hostCapabilities?.includes(AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY) === true
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<ReviewAgentNotice | null>(null)
  const [confirming, setConfirming] = useState(false)
  const answerRef = useRef<((discard: boolean) => void) | null>(null)

  const answer = (discard: boolean): void => {
    setConfirming(false)
    answerRef.current?.(discard)
    answerRef.current = null
  }

  const launch = async (
    options: AzureDevOpsReviewOptions,
    buildPrompt?: (tools: { cli: string; mcp: boolean }) => string
  ): Promise<boolean> => {
    if (!client || !pullRequest || busy) {
      return false
    }
    setBusy(true)
    setNotice(null)
    try {
      const result = await launchAzureDevOpsReviewAgent({
        client,
        hostCapabilities,
        pullRequest,
        options,
        buildPrompt,
        confirmDiscard: () =>
          new Promise<boolean>((resolve) => {
            answerRef.current = resolve
            setConfirming(true)
          })
      })
      const shown = promptedLaunchNotice(result, 'the review workspace')
      setNotice({
        tone: shown.succeeded ? 'success' : 'error',
        text: shown.success ?? shown.error ?? shown.warning ?? '',
        worktreeId: shown.succeeded ? (result.worktreeId ?? null) : null
      })
      return shown.succeeded
    } finally {
      setBusy(false)
    }
  }

  const openAgent = (worktreeId: string): void =>
    router.push({ pathname: '/h/[hostId]/session/[worktreeId]', params: { hostId, worktreeId } })

  const confirmElement = (
    <ConfirmModal
      visible={confirming}
      title="Discard changes in the review workspace?"
      message="The shared review workspace has uncommitted changes. Switching to this pull request discards them; ignored files such as dependencies stay."
      confirmLabel="Discard and switch"
      destructive
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  )

  return { supported, busy, notice, launch, openAgent, confirmElement }
}
