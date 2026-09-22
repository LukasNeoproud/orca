import { installRuntimeLinearCommandSurface } from './runtime-linear-command-surface'
import { OrcaRuntimeWithResolveWaiter } from './orca-runtime-resolve-waiter'
import type { RuntimeCommandSurfaceHost } from './orca-runtime-core'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import {
  resolveStructuredAgentSessionAdoptionForCreate,
  structuredAdoptionAccountHomeCandidates
} from './structured-agent-session-create-adoption'
import { getSystemCodexHomePath, getOrcaManagedCodexHomePath } from '../codex/codex-home-paths'
import { resolveCodexSessionResumeProvenance } from '../codex/codex-session-resume-home'
import { resolveTuiAgentLaunchEnv } from '../../shared/tui-agent-launch-defaults'
import { resolvePinnedCodexRolloutProof } from '../codex/codex-tui-rollout-proof'
import { readCodexRolloutSessionMeta } from '../codex/codex-rollout-session-meta'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import { resolveLoginShellEnvironment } from '../startup/login-shell-environment'
import { resolveCodexCommand } from '../codex-cli/command'
import { activeStructuredAgentSessionTurnId } from '../../shared/structured-agent-session-projection'

class OrcaRuntimeService extends OrcaRuntimeWithResolveWaiter {
  getConversationContinuationSettings() {
    return this.requireStore().getSettings()
  }

  isConversationContinuationBusy(providerSessionId: string): boolean {
    const rows = this.getAgentStatusSnapshotFn?.() ?? []
    if (
      rows.some(
        (row) =>
          row.providerSession?.id === providerSessionId &&
          (row.state !== 'done' || row.subagents?.some((agent) => agent.state === 'working'))
      )
    ) {
      return true
    }
    const host = getStructuredAgentSessionHost()
    const records = host?.deps.store.listRecords() ?? []
    for (const record of records) {
      if (
        !record.providerHandleChain.some(
          (link) => link.handle.provider === 'codex' && link.handle.threadId === providerSessionId
        )
      ) {
        continue
      }
      try {
        if (activeStructuredAgentSessionTurnId(host!.journalSnapshot(record.sessionId).items)) {
          return true
        }
      } catch {
        // An unloaded session is inspected through its provider transcript.
      }
    }
    return false
  }

  async resolveConversationContinuationSource(input: {
    providerSessionId: string
    workspaceId: string
  }) {
    const selector = `id:${input.workspaceId}`
    const location = await this.resolveStructuredAgentSessionLocation(selector)
    if (location.executionHostId !== 'local' || location.wslDistro !== null) {
      throw new Error('Conversation continuation requires the owning host runtime.')
    }
    const workspacePath = (await this.resolveRuntimeFileTarget(selector)).worktree.path
    const settings = this.requireStore().getSettings()
    const record = getStructuredAgentSessionHost()
      ?.deps.store.listRecords()
      .find(
        (item) =>
          item.provider === 'codex' &&
          item.providerHandleChain.some(
            (link) =>
              link.handle.provider === 'codex' && link.handle.threadId === input.providerSessionId
          )
      )
    const reportedPaths = [
      ...new Set(
        (this.getAgentProviderSessionSnapshotFn?.() ?? [])
          .filter((row) => !row.connectionId && row.providerSession?.id === input.providerSessionId)
          .map((row) => row.providerSession?.transcriptPath)
          .filter((path): path is string => Boolean(path))
      )
    ]
    if (reportedPaths.length > 1) {
      throw new Error('Codex session has ambiguous transcript ownership.')
    }
    const provenance =
      !record && reportedPaths[0]
        ? await resolveCodexSessionResumeProvenance({
            sessionId: input.providerSessionId,
            transcriptPath: reportedPaths[0],
            trustedCodexHomes: structuredAdoptionAccountHomeCandidates({
              settings,
              agent: 'codex',
              selectedAccountHomePath: getSystemCodexHomePath()
            }),
            getSelectedAccountCodexHome: () => null,
            systemCodexHomePath: getSystemCodexHomePath(),
            sharedRuntimeCodexHomePath: getOrcaManagedCodexHomePath()
          })
        : null
    if (provenance?.outcome === 'fresh') {
      throw new Error('Codex source account could not be verified.')
    }
    const source = record
      ? {
          accountHomePath: record.accountHome.path,
          transcriptPath: await resolvePinnedCodexRolloutProof(
            record.accountHome.path,
            input.providerSessionId
          )
        }
      : provenance?.outcome === 'resume'
        ? { accountHomePath: provenance.homePath, transcriptPath: provenance.transcriptPath }
        : await resolveStructuredAgentSessionAdoptionForCreate({
            host: null,
            settings,
            agent: 'codex',
            providerSessionId: input.providerSessionId,
            selfSessionId: '',
            selectedAccountHomePath: getSystemCodexHomePath()
          })
    if (!source.transcriptPath) {
      throw new Error('Codex transcript is unavailable.')
    }
    const metadata = await readCodexRolloutSessionMeta(source.transcriptPath)
    const cwd = metadata?.payload.cwd
    if (
      metadata?.id !== input.providerSessionId ||
      typeof cwd !== 'string' ||
      relativePathInsideRoot(workspacePath, cwd) === null
    ) {
      throw new Error('Codex source does not belong to this workspace.')
    }
    const env: NodeJS.ProcessEnv = {
      ...(await resolveLoginShellEnvironment()),
      ...resolveTuiAgentLaunchEnv('codex', settings.agentDefaultEnv),
      CODEX_HOME: source.accountHomePath
    }
    return {
      providerSessionId: input.providerSessionId,
      workspaceId: input.workspaceId,
      cwd,
      transcriptPath: source.transcriptPath,
      codexHome: source.accountHomePath,
      launch: {
        command: resolveCodexCommand({
          pathEnv: env.PATH ?? env.Path,
          homePath: env.HOME ?? env.USERPROFILE
        }),
        args: [
          ...(record?.launchArgs ?? this.resolveConfiguredStructuredLaunchArgs('codex')),
          'app-server'
        ],
        cwd,
        env: Object.fromEntries(
          Object.entries(env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      }
    }
  }
}
type OrcaRuntimeServiceExport = RuntimeCommandSurfaceHost<OrcaRuntimeService>
const OrcaRuntimeServiceExport = OrcaRuntimeService as unknown as {
  new (...args: ConstructorParameters<typeof OrcaRuntimeService>): OrcaRuntimeServiceExport
  readonly prototype: OrcaRuntimeServiceExport
}
export { OrcaRuntimeServiceExport as OrcaRuntimeService }
installRuntimeLinearCommandSurface(OrcaRuntimeServiceExport.prototype)

export type { LegacyWorkerTerminalRecoveryResult } from './runtime-legacy-worker-terminal-recovery-types'
export type {
  RuntimeAutomationCreateInput,
  RuntimeAutomationUpdateInput
} from './runtime-automation-controller'
export type { SubscriptionRegistration } from './runtime-subscription-registry'
export type {
  OrchestrationCompatibilityCallerAuthority,
  OrchestrationCompatibilityTerminalAuthority,
  RuntimePtyDataAdmission,
  RuntimeTerminalAgentStatusEvent
} from './runtime-terminal-contracts'
export type { MessageWaitResult } from './runtime-message-waiters'
export type { AccountsSnapshot, CodexRateLimitResetRpcResult } from './runtime-account-controller'
export type {
  MobileNotificationDispatchEvent,
  MobileNotificationDismissEvent,
  MobileNotificationEvent
} from './runtime-mobile-notification-controller'
export type { RuntimeTerminalDataMeta } from './runtime-terminal-stream-consumers'
export type { RemoteFetchResult, RemoteTrackingBase } from './runtime-remote-fetch-controller'
export {
  computeTerminalTailWaitState,
  tailGainedNewerBlockedReason,
  type TerminalTailWaitState
} from './terminal-wait-tail-state'
export { appendNormalizedToTailBuffer } from './terminal-tail-buffer'
export { appendNormalizedToMultilineTailBufferUnwindowed } from './terminal-tail-redraw-buffer'
export { buildPreview } from './terminal-tail-state'
export { buildRestoredTerminalTailSeed } from './terminal-tail-restore-seed'
export { projectTerminalTailLines } from './orca-runtime-terminal-projection'
export { resolveWorktreeScanCacheTtlMs } from './runtime-worktree-scan-cache'
export type {
  RuntimeWorktreeLifecycleEvent,
  DriverState,
  PtyLayoutTarget,
  PtyLayoutState,
  ApplyLayoutResult,
  RuntimeRendererReloadFence
} from './orca-runtime-core'
export {
  AUTHORITATIVE_TERMINAL_SNAPSHOT_TIMEOUT_MS,
  WORKTREE_SCAN_ADMIN_RECONCILE_INTERVAL_MS,
  WORKTREE_SCAN_ADMIN_FINGERPRINT_TIMEOUT_MS
} from './orca-runtime-postlude'
