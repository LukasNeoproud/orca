import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const PR_KEY_NOTE =
  'A pull request key looks like `dev.azure.com/contoso+<repository-id>+123`; `orca ado prs` lists them.'

const LOCATION_FLAGS = ['file', 'line', 'end-line', 'side']

const JSON_ENVELOPE_NOTE = '`--json` wraps the answer as `{ "ok": true, "result": … }`.'

export const AZURE_DEVOPS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ado', 'prs'],
    summary: 'List Azure DevOps pull requests where you are a reviewer',
    usage: 'orca ado prs [--status active|completed|abandoned|all] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'status'],
    examples: ['orca ado prs --json', 'orca ado prs --status all --json'],
    notes: [
      'Covers Azure Repos repositories added to Orca as local projects.',
      'Defaults to active pull requests.'
    ]
  },
  {
    path: ['ado', 'pr'],
    summary: 'Show an Azure DevOps pull request with changes, threads and drafts',
    usage: 'orca ado pr <key> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: ['orca ado pr dev.azure.com/contoso+0f1e…+123 --json'],
    notes: [
      PR_KEY_NOTE,
      `${JSON_ENVELOPE_NOTE} \`.result\` holds pullRequest, latestIteration, threads, changes (paths only; read the code with git) and drafts.`
    ]
  },
  {
    path: ['ado', 'drafts'],
    summary: 'List Orca draft comments for a pull request',
    usage: 'orca ado drafts <key> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key'],
    positionalArgs: ['key'],
    notes: [
      PR_KEY_NOTE,
      `${JSON_ENVELOPE_NOTE} The drafts are the array at \`.result.drafts\`.`,
      'Drafts marked outdated were written against an older iteration; re-anchor them with `orca ado draft update <id> --line …` or delete them.'
    ]
  },
  {
    path: ['ado', 'draft', 'create'],
    summary: 'Save a draft review comment in Orca (never published by this command)',
    usage:
      'orca ado draft create --pr <key> --kind inline|file|general|reply (--body <text> | --body-file <path|->) [--file <path>] [--line <n>] [--end-line <n>] [--side right|left] [--thread <id>] [--thread-status active|fixed|wontFix|closed|byDesign] [--commit <sha>] [--agent-label <name>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'pr',
      'kind',
      'body',
      'body-file',
      ...LOCATION_FLAGS,
      'thread',
      'thread-status',
      'commit',
      'agent-label'
    ],
    examples: [
      'orca ado draft create --pr <key> --kind inline --file src/app.ts --line 42 --end-line 45 --body "Null check missing" --json',
      'orca ado draft create --pr <key> --kind reply --thread 7 --body "Fixed in the latest push?" --json'
    ],
    notes: [
      'inline needs --file and --line; file needs --file; reply needs --thread.',
      'Paths are repository-relative. Lines refer to the new version unless --side left.',
      '--commit records the commit you reviewed (defaults to the latest iteration); older commits create outdated drafts.',
      'Drafts stay in Orca until the user selects and publishes them.'
    ]
  },
  {
    path: ['ado', 'draft', 'update'],
    summary: 'Edit or re-anchor an Orca draft review comment',
    usage:
      'orca ado draft update <id> [--body <text> | --body-file <path|->] [--file <path>] [--line <n>] [--end-line <n>] [--side right|left] [--thread-status <status>] [--rebase] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'id',
      'body',
      'body-file',
      ...LOCATION_FLAGS,
      'thread-status',
      'rebase'
    ],
    positionalArgs: ['id'],
    notes: [
      'Changing the location or passing --rebase moves the draft to the latest iteration, which clears outdated.'
    ]
  },
  {
    path: ['ado', 'draft', 'rm'],
    summary: 'Delete an Orca draft review comment',
    usage: 'orca ado draft rm <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id']
  },
  {
    path: ['ado', 'mcp'],
    hidden: true,
    summary: 'Run the Azure DevOps review MCP server over stdio',
    usage: 'orca ado mcp',
    allowedFlags: []
  }
]
