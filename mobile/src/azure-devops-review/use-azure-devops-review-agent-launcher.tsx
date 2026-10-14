import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { ConfirmModal } from '../components/ConfirmModal'
import { useHostProtocolGates } from '../components/HostProtocolGate'
import type { RpcClient } from '../transport/rpc-client'
import { AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import {
  runAzureDevOpsReviewAgent,
  type AzureDevOpsReviewAgentAsk,
  type DistributiveOmit
} from './azure-devops-review-agent-launch'

export type ReviewAgentNotice = {
  tone: 'success' | 'error'
  text: string
  /** The workspace the agent runs in, to open from the notice. */
  worktreeId: string | null
}

/** Has the desktop start review agents for one pull request and reports how each request went. */
export function useAzureDevOpsReviewAgentLauncher({
  hostId,
  client,
  pullRequestKey
}: {
  hostId: string
  client: RpcClient | null
  pullRequestKey: string
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
    ask: DistributiveOmit<AzureDevOpsReviewAgentAsk, 'pullRequestKey'>
  ): Promise<boolean> => {
    if (!client || !pullRequestKey || busy) {
      return false
    }
    setBusy(true)
    setNotice(null)
    try {
      const outcome = await runAzureDevOpsReviewAgent({
        client,
        ask: { ...ask, pullRequestKey },
        confirmDiscard: () =>
          new Promise<boolean>((resolve) => {
            answerRef.current = resolve
            setConfirming(true)
          })
      })
      setNotice(
        outcome.kind === 'not-started'
          ? { tone: 'error', text: outcome.message, worktreeId: null }
          : {
              tone: 'success',
              text:
                outcome.kind === 'sent-to-chat'
                  ? "Sent to the pull request's AI chat"
                  : 'Agent started in the review workspace',
              worktreeId: outcome.worktreeId
            }
      )
      return outcome.kind !== 'not-started'
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
