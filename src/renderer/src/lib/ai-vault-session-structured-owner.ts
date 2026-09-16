import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../../../shared/ai-vault-resume-preparation'
import { hasRuntimeRpcErrorCode } from '../../../shared/runtime-rpc-error-code'

type PrepareSessionResume = (
  args: AiVaultPrepareSessionResumeArgs
) => Promise<AiVaultPrepareSessionResumeResult>

/** Revalidates the host lease directly; history-row shape is not liveness evidence. */
export async function classifyRememberedAiVaultStructuredOwner(
  session: AiVaultSession,
  prepareSessionResume: PrepareSessionResume = (args) =>
    window.api.aiVault.prepareSessionResume(args)
): Promise<'live' | 'unverifiable' | 'exited'> {
  try {
    await prepareSessionResume({
      agent: session.agent,
      sessionId: session.sessionId,
      filePath: session.filePath,
      codexHome: session.codexHome,
      executionHostId: session.executionHostId
    })
    return 'exited'
  } catch (error) {
    if (hasRuntimeRpcErrorCode(error, 'agent_session_conflict')) {
      return 'live'
    }
    return 'unverifiable'
  }
}
