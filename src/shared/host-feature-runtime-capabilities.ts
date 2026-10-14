import { BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY } from './backlog-task-association'
import { ORCAD_RUNTIME_CAPABILITIES } from './orcad-runtime-capabilities'

export const PROJECT_HOST_SETUP_HOST_LOCAL_LINK_RUNTIME_CAPABILITY =
  'project-host-setup.host-local-link.v1' as const
export const EMULATOR_MOBILE_STREAM_RUNTIME_CAPABILITY = 'emulator.mobile-stream.v1' as const
// Why: remote clients must not poll or respond to host-owned interaction requests until the
// complete request/wait/pending/respond surface is registered on that host.
export const TERMINAL_INTERACTION_RUNTIME_CAPABILITY = 'terminal-interaction.v1' as const
// hostSystem.snapshot / setPowerMode / terminateProcess for the paired-client system panel.
export const HOST_SYSTEM_RUNTIME_CAPABILITY = 'host-system.v1' as const
// azureDevOpsReview.* for the Azure DevOps pull request review surfaces.
export const AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY = 'azure-devops-review.v1' as const
// Paired phones may read file diffs and have the desktop start or brief review agents.
export const AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY =
  'azure-devops-review.mobile-agent.v1' as const

export const HOST_FEATURE_RUNTIME_CAPABILITIES = [
  HOST_SYSTEM_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY,
  EMULATOR_MOBILE_STREAM_RUNTIME_CAPABILITY,
  'backlog.v1',
  BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY,
  PROJECT_HOST_SETUP_HOST_LOCAL_LINK_RUNTIME_CAPABILITY,
  TERMINAL_INTERACTION_RUNTIME_CAPABILITY
] as const

// Joined here because protocol-version.ts sits at its line cap; the order matches the old spreads.
export const HOST_FEATURE_AND_ORCAD_RUNTIME_CAPABILITIES = [
  ...HOST_FEATURE_RUNTIME_CAPABILITIES,
  ...ORCAD_RUNTIME_CAPABILITIES
] as const
