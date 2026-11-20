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

// azureDevOpsReview.publishDrafts reads `vote`; hosts without it drop the field without an error.
export const AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY = 'azure-devops-review.vote.v1' as const
// Drafts take `severity` and `evidence` and come back with the host's checks; hosts without it
// drop both fields without an error.
export const AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY =
  'azure-devops-review.findings.v1' as const

// qualityGates.* runs the gates of a repository on the host that owns the worktree.
export const QUALITY_GATES_RUNTIME_CAPABILITY = 'quality-gates.v1' as const
// qualityGates.subscribe signals a change instead of the client asking on an interval.
export const QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY = 'quality-gates.subscribe.v1' as const
// qualityGates.subscribe reads `cadence`; a host without it would watch the tree of every
// subscribed workspace at the foreground interval.
export const QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY =
  'quality-gates.subscribe-cadence.v1' as const
// qualityGates.setFeedbackLoop exists and qualityGates.status carries `feedbackLoop`.
export const QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY =
  'quality-gates.feedback-loop.v1' as const
// qualityGates.setRepositorySettings exists: a paired desktop writes the gates and the loop of a
// repository this host keeps. A host without it has them set up in its own Orca only.
export const QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY =
  'quality-gates.repository-settings.v1' as const

export const HOST_FEATURE_RUNTIME_CAPABILITIES = [
  HOST_SYSTEM_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY,
  QUALITY_GATES_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
  QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY,
  QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY,
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
