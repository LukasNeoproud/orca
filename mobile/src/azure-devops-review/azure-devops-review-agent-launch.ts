import type { RpcClient } from '../transport/rpc-client'
import type {
  AzureDevOpsReviewAgentRequest,
  AzureDevOpsReviewAgentResult
} from '../../../src/shared/azure-devops-review-agent-request'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type AzureDevOpsReviewAgentAsk = DistributiveOmit<
  AzureDevOpsReviewAgentRequest,
  'discardChanges'
>

export type AzureDevOpsReviewAgentOutcome =
  | Extract<AzureDevOpsReviewAgentResult, { kind: 'started' | 'sent-to-chat' }>
  | { kind: 'not-started'; message: string }

/**
 * Asks the desktop to start a review agent, or hand drafts to the pull request's AI chat, with its
 * own launch code; asks the user before it discards changes in the shared review workspace.
 */
export async function runAzureDevOpsReviewAgent(args: {
  client: RpcClient
  ask: AzureDevOpsReviewAgentAsk
  confirmDiscard: () => Promise<boolean>
}): Promise<AzureDevOpsReviewAgentOutcome> {
  const send = (discardChanges: boolean) =>
    azureDevOpsReviewRequest<AzureDevOpsReviewAgentResult>(
      args.client,
      'azureDevOpsReview.runAgent',
      { ...args.ask, discardChanges }
    )
  try {
    let result = await send(false)
    if (result.kind === 'dirty') {
      if (!(await args.confirmDiscard())) {
        return { kind: 'not-started', message: 'The review workspace was left as it is.' }
      }
      result = await send(true)
    }
    return result.kind === 'started' || result.kind === 'sent-to-chat'
      ? result
      : { kind: 'not-started', message: result.message }
  } catch (error) {
    return { kind: 'not-started', message: error instanceof Error ? error.message : String(error) }
  }
}
