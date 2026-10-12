import type { AiVaultSession } from '../../../shared/ai-vault-types'

/** Which surface a history session reopens in. */
export type AiVaultSessionOpenMode = 'terminal' | 'structured'

export type AiVaultSessionOpenDeps = {
  activateRemembered: (target: AiVaultSessionOpenedTarget) => Promise<boolean> | boolean
  activateExistingTerminal: (session: AiVaultSession) => 'live' | 'pending' | null
  activateExistingStructured: (session: AiVaultSession) => Promise<void>
  classifyRemembered: (
    session: AiVaultSession,
    target: AiVaultSessionOpenedTarget
  ) => Promise<'live' | 'unverifiable' | 'exited'> | 'live' | 'unverifiable' | 'exited'
  ownershipUnverifiable: (session: AiVaultSession) => void
  openTerminal: (
    session: AiVaultSession,
    targetWorkspaceId?: string
  ) => Promise<AiVaultSessionOpenedTarget | null>
  openStructured: (
    session: AiVaultSession,
    targetWorkspaceId?: string
  ) => Promise<AiVaultSessionOpenedTarget | null>
}

export type AiVaultSessionOpenedTarget =
  | { kind: 'terminal'; workspaceId: string; tabId: string }
  | { kind: 'structured'; workspaceId: string; sessionId: string }

const opensInFlight = new Map<string, Promise<void>>()
const openedTargets = new Map<string, AiVaultSessionOpenedTarget>()
const OPENED_TARGET_LIMIT = 256

/** Opens one history identity in the requested surface while preserving any existing live owner. */
export function openAiVaultSession(
  session: AiVaultSession,
  mode: AiVaultSessionOpenMode,
  targetWorkspaceId: string | undefined,
  deps: AiVaultSessionOpenDeps
): Promise<void> {
  const identity = openIdentity(session)
  const existing = opensInFlight.get(identity)
  if (existing) {
    return existing
  }
  const open = runOpen(session, mode, targetWorkspaceId, deps)
  opensInFlight.set(identity, open)
  const cleanup = (): void => {
    if (opensInFlight.get(identity) === open) {
      opensInFlight.delete(identity)
    }
  }
  void open.then(cleanup, cleanup)
  return open
}

function openIdentity(session: AiVaultSession): string {
  return JSON.stringify([
    session.executionHostId,
    session.agent,
    session.sessionId,
    session.codexHome ?? null
  ])
}

async function runOpen(
  session: AiVaultSession,
  mode: AiVaultSessionOpenMode,
  targetWorkspaceId: string | undefined,
  deps: AiVaultSessionOpenDeps
): Promise<void> {
  const identity = openIdentity(session)
  const remembered = openedTargets.get(identity)
  const existingTerminal = deps.activateExistingTerminal(session)
  if (existingTerminal) {
    return
  }
  if (session.structuredSession) {
    await deps.activateExistingStructured(session)
    return
  }
  if (remembered) {
    const ownerState = await deps.classifyRemembered(session, remembered)
    if (ownerState === 'exited') {
      openedTargets.delete(identity)
    } else {
      if (!(await deps.activateRemembered(remembered))) {
        deps.ownershipUnverifiable(session)
      }
      return
    }
  }
  if (mode === 'structured') {
    const opened = await deps.openStructured(session, targetWorkspaceId)
    if (opened) {
      rememberOpenedTarget(identity, opened)
    }
    return
  }
  const opened = await deps.openTerminal(session, targetWorkspaceId)
  if (opened) {
    rememberOpenedTarget(identity, opened)
  }
}

function rememberOpenedTarget(identity: string, target: AiVaultSessionOpenedTarget): void {
  openedTargets.delete(identity)
  openedTargets.set(identity, target)
  while (openedTargets.size > OPENED_TARGET_LIMIT) {
    const oldest = openedTargets.keys().next().value
    if (oldest === undefined) {
      return
    }
    openedTargets.delete(oldest)
  }
}
