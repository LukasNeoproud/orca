import type { HandlerGroup } from './handler-group-manifest'
import { BROWSER_HANDLER_GROUPS } from './browser-handler-groups'

// Agent-facing interaction prompts and Azure DevOps review commands.
export const REVIEW_INTERACTION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'interact',
    keys: ['interact request', 'interact mcp', 'interact chat-mcp'],
    load: async () => (await import('./handlers/interact.js')).INTERACT_HANDLERS
  },
  {
    name: 'azure-devops',
    keys: [
      'ado prs',
      'ado pr',
      'ado drafts',
      'ado draft create',
      'ado draft update',
      'ado draft rm',
      'ado mcp'
    ],
    load: async () => (await import('./handlers/azure-devops.js')).AZURE_DEVOPS_HANDLERS
  }
]

// Joined here because the manifest sits at its line cap; the order matches the old spreads.
export const BROWSER_AND_REVIEW_INTERACTION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  ...BROWSER_HANDLER_GROUPS,
  ...REVIEW_INTERACTION_HANDLER_GROUPS
]
