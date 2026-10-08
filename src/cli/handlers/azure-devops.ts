import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewListResult
} from '../../shared/azure-devops-review-types'
import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { readLinearBody } from '../linear-request-builders'
import {
  buildAzureDevOpsDraftCreateParams,
  buildAzureDevOpsDraftPatch,
  parseAzureDevOpsListStatus
} from '../azure-devops-review-requests'
import {
  formatAzureDevOpsDrafts,
  formatAzureDevOpsPullRequestDetail,
  formatAzureDevOpsPullRequestList
} from '../azure-devops-format'
import { runAzureDevOpsReviewMcpServer } from '../azure-devops-review-mcp'

type DraftResult = { draft: AzureDevOpsReviewDraftView }

function locationFlags(flags: Map<string, string | boolean>) {
  return {
    file: getOptionalStringFlag(flags, 'file'),
    line: getOptionalPositiveIntegerFlag(flags, 'line'),
    endLine: getOptionalPositiveIntegerFlag(flags, 'end-line'),
    side: getOptionalStringFlag(flags, 'side'),
    threadStatus: getOptionalStringFlag(flags, 'thread-status')
  }
}

function formatDraft(result: DraftResult): string {
  return formatAzureDevOpsDrafts([result.draft])
}

export const AZURE_DEVOPS_HANDLERS: Record<string, CommandHandler> = {
  'ado prs': async ({ flags, client, json }) => {
    const status = parseAzureDevOpsListStatus(getOptionalStringFlag(flags, 'status'))
    const response = await client.call<AzureDevOpsReviewListResult>('azureDevOpsReview.list', {
      status
    })
    printResult(response, json, formatAzureDevOpsPullRequestList)
  },
  'ado pr': async ({ flags, client, json }) => {
    const response = await client.call<AzureDevOpsReviewDetail>('azureDevOpsReview.get', {
      pullRequestKey: getRequiredStringFlag(flags, 'key')
    })
    printResult(response, json, formatAzureDevOpsPullRequestDetail)
  },
  'ado drafts': async ({ flags, client, json }) => {
    const response = await client.call<{ drafts: AzureDevOpsReviewDraftView[] }>(
      'azureDevOpsReview.drafts',
      { pullRequestKey: getRequiredStringFlag(flags, 'key') }
    )
    printResult(response, json, (result) => formatAzureDevOpsDrafts(result.drafts))
  },
  'ado draft create': async ({ flags, client, json, cwd }) => {
    const params = buildAzureDevOpsDraftCreateParams({
      pr: getRequiredStringFlag(flags, 'pr'),
      kind: getRequiredStringFlag(flags, 'kind'),
      body: await readLinearBody(flags, cwd, { required: true }),
      ...locationFlags(flags),
      thread: getOptionalPositiveIntegerFlag(flags, 'thread'),
      commit: getOptionalStringFlag(flags, 'commit'),
      agentLabel: getOptionalStringFlag(flags, 'agent-label')
    })
    const response = await client.call<DraftResult>('azureDevOpsReview.createDraft', params)
    printResult(response, json, formatDraft)
  },
  'ado draft update': async ({ flags, client, json, cwd }) => {
    const patch = buildAzureDevOpsDraftPatch({
      body: await readLinearBody(flags, cwd, { required: false }),
      ...locationFlags(flags),
      rebase: flags.get('rebase') === true
    })
    const response = await client.call<DraftResult>('azureDevOpsReview.updateDraft', {
      id: getRequiredStringFlag(flags, 'id'),
      patch
    })
    printResult(response, json, formatDraft)
  },
  'ado draft rm': async ({ flags, client, json }) => {
    const response = await client.call<{ deleted: boolean }>('azureDevOpsReview.deleteDraft', {
      id: getRequiredStringFlag(flags, 'id')
    })
    printResult(response, json, (result) => (result.deleted ? 'Deleted.' : 'No such draft.'))
  },
  'ado mcp': async ({ client }) => {
    await runAzureDevOpsReviewMcpServer(client)
  }
}
