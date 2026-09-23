import type { CodexStructuredLaunch } from './codex-structured-session-state'
import { CODEX_SPAWN_TOKEN_ENV } from './codex-structured-owner-identity'
import { structuredWorkerChildIdentityEnv } from '../runtime/structured-worker-child-identity-env'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { prependOrcaCliDirToChildPath } from '../cli/orca-cli-child-path'

export function buildCodexStructuredChildEnvironment(
  launch: CodexStructuredLaunch,
  spawnToken: string,
  sessionId: string
): Record<string, string> {
  const env = {
    ...structuredWorkerChildIdentityEnv(sessionId, {
      ...launch.env,
      ...(launch.codexHome ? { CODEX_HOME: launch.codexHome } : {})
    }),
    [CODEX_SPAWN_TOKEN_ENV]: spawnToken,
    ORCA_AGENT_SESSION_ID: sessionId
  }
  applyOrcaCliPath(env)
  return env
}

function applyOrcaCliPath(env: Record<string, string>): void {
  if (!hasAppEnvironment()) {
    return
  }
  const app = getAppEnvironment()
  // The login-shell snapshot can omit Orca's dev user-data override. Pinning it
  // makes the plugin CLI read this runtime's metadata instead of a production default.
  env.ORCA_USER_DATA_PATH = app.getPath('userData')
  prependOrcaCliDirToChildPath(env, {
    isPackaged: app.isPackaged(),
    userDataPath: app.getPath('userData'),
    resourcesPath: process.resourcesPath ?? null
  })
}
