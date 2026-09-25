import type { ConversationContinuationSource } from '../../shared/conversation-continuation'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { CodexContinuationResolvedSource } from './codex-continuation-service'

function sourceMatches(
  expected: ConversationContinuationSource,
  actual: CodexContinuationResolvedSource
): boolean {
  return (
    expected.providerSessionId === actual.providerSessionId &&
    expected.workspaceId === actual.workspaceId
  )
}

export function assertResolvedLaunch(
  requested: ConversationContinuationSource,
  resolved: CodexContinuationResolvedSource
): void {
  if (!sourceMatches(requested, resolved)) {
    throw new Error('conversation_continuation_resolver_identity_mismatch')
  }
  if (
    !resolved.launch.cwd ||
    normalizeRuntimePathForComparison(resolved.launch.cwd) !==
      normalizeRuntimePathForComparison(resolved.cwd)
  ) {
    throw new Error('conversation_continuation_launch_cwd_mismatch')
  }
  const launchHome = resolved.launch.env?.CODEX_HOME
  if (
    !launchHome ||
    normalizeRuntimePathForComparison(launchHome) !==
      normalizeRuntimePathForComparison(resolved.codexHome) ||
    resolved.launch.envToDelete?.includes('CODEX_HOME')
  ) {
    throw new Error('conversation_continuation_launch_home_mismatch')
  }
  if (resolved.launch.args.at(-1) !== 'app-server') {
    throw new Error('conversation_continuation_launch_not_app_server')
  }
}
