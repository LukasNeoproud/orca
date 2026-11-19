import { REVIEW_CODE_CITATION_KIND, REVIEW_FINDING_SEVERITIES } from './review-finding'
import { REVIEW_FINDING_LIMITS } from './review-finding-input'

/** A review tool as both `orca ado mcp` and Orca's Pi extension declare it. */
export type AzureDevOpsReviewToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}

const PR_KEY = {
  type: 'string',
  description:
    'Pull request key from ado_list_pull_requests, e.g. dev.azure.com/contoso+<repo-id>+123'
}
const LOCATION_PROPERTIES = {
  file: { type: 'string', description: 'Repository-relative file path' },
  line: { type: 'integer', minimum: 1, description: 'First commented line' },
  endLine: {
    type: 'integer',
    minimum: 1,
    description: 'Last commented line (defaults to line)'
  },
  side: {
    type: 'string',
    enum: ['right', 'left'],
    description: 'right = new version (default)'
  },
  threadStatus: {
    type: 'string',
    enum: ['active', 'fixed', 'wontFix', 'closed', 'byDesign'],
    description: 'Reply drafts only: thread status to set when the user publishes'
  }
}

const FINDING_PROPERTIES = {
  severity: {
    type: 'string',
    enum: [...REVIEW_FINDING_SEVERITIES],
    description:
      'How serious the finding is: error = wrong or unsafe, warning = probably a problem, suggestion = a better way, nit = style or wording. Leave it out on a reply that only answers its thread: a reply with a severity is a finding.'
  },
  evidence: {
    type: 'array',
    maxItems: REVIEW_FINDING_LIMITS.evidenceItems,
    description:
      'Proof of the finding. Orca compares every citation with the file at the commit of the draft: the reviewer sees a finding without evidence as uncertain and any draft whose quote is not in the file as contradicted.',
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [REVIEW_CODE_CITATION_KIND] },
        filePath: {
          type: 'string',
          description:
            'Repository-relative path of the quoted file; any file at that commit, changed or not'
        },
        startLine: { type: 'integer', minimum: 1, description: 'First quoted line' },
        endLine: {
          type: 'integer',
          minimum: 1,
          description: 'Last quoted line (defaults to startLine)'
        },
        quote: {
          type: 'string',
          maxLength: REVIEW_FINDING_LIMITS.quoteChars,
          description: 'The quoted lines, copied from the file as they are'
        },
        note: {
          type: 'string',
          maxLength: REVIEW_FINDING_LIMITS.noteChars,
          description: 'What the quoted code shows, in one sentence'
        }
      },
      required: ['kind', 'filePath', 'startLine', 'quote']
    }
  }
}

// Why no publish tool: drafts reach Azure DevOps only when the user publishes them in Orca.
export const AZURE_DEVOPS_REVIEW_TOOLS: AzureDevOpsReviewToolDefinition[] = [
  {
    name: 'ado_list_pull_requests',
    description:
      'List Azure DevOps pull requests where the user is a reviewer, across Azure Repos projects added to Orca.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned', 'all']
        }
      }
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'ado_get_pull_request',
    description:
      'Get a pull request: description, branches, latest iteration, changed files, comment threads and Orca drafts. Thread anchors are lines of the latest iteration; outdated marks a thread whose commented lines were rewritten or removed since.',
    inputSchema: {
      type: 'object',
      properties: { pullRequestKey: PR_KEY },
      required: ['pullRequestKey']
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'ado_list_drafts',
    description:
      'List Orca draft comments for a pull request. Outdated drafts target an older iteration; update or delete them. evidenceChecks[i] is how Orca checked evidence[i]; certainty is what the reviewer sees for your draft.',
    inputSchema: {
      type: 'object',
      properties: { pullRequestKey: PR_KEY },
      required: ['pullRequestKey']
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'ado_create_draft',
    description:
      'Save a review comment as an Orca draft for the user to edit and publish. kind: inline (file+line), file (file), general, reply (threadId). Give every finding a severity and evidence; the answer says how Orca checked the evidence (evidenceChecks, certainty), so correct a refuted citation with ado_update_draft.',
    inputSchema: {
      type: 'object',
      properties: {
        pullRequestKey: PR_KEY,
        kind: { type: 'string', enum: ['inline', 'file', 'general', 'reply'] },
        body: { type: 'string', description: 'Markdown comment' },
        ...LOCATION_PROPERTIES,
        threadId: { type: 'integer', minimum: 1 },
        commit: {
          type: 'string',
          description: 'Commit you reviewed; defaults to the latest iteration'
        },
        ...FINDING_PROPERTIES
      },
      required: ['pullRequestKey', 'kind', 'body']
    }
  },
  {
    name: 'ado_update_draft',
    description:
      'Edit an Orca draft. Changing its location or rebase=true moves it to the latest iteration and clears outdated. evidence replaces the whole list.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        body: { type: 'string' },
        ...LOCATION_PROPERTIES,
        rebase: { type: 'boolean' },
        ...FINDING_PROPERTIES
      },
      required: ['id']
    }
  },
  {
    name: 'ado_delete_draft',
    description: 'Delete an Orca draft comment.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    },
    annotations: { destructiveHint: true }
  }
]
