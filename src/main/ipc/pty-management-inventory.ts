import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/constants'
import { PTY_SESSION_ID_SEPARATOR, parsePtySessionId } from '../../shared/pty-session-id-format'
import { sameEndpointIdentity } from '../daemon/daemon-endpoint-incarnation'
import type { DaemonEndpointIdentity } from '../daemon/daemon-hello-protocol'
import type { DaemonPtyAdapter } from '../daemon/daemon-pty-adapter'
import type { DaemonSessionInfo } from '../daemon/types'

export const MAX_TERMINATION_POLL_ATTEMPTS = 65
export const TERMINATION_POLL_INTERVAL_MS = 100

export type InventoryStatus = 'complete' | 'unverifiable'
export type TerminationStatus = 'live' | 'unverifiable' | 'exited'
export type ManagementSession = DaemonSessionInfo & {
  agentOwnership: 'present' | 'absent' | 'unknown'
  paneBound?: true
  worktreeId?: string
}
export type OwnedSession = {
  session: ManagementSession
  owner: DaemonPtyAdapter
  ownerIdentity: DaemonEndpointIdentity | null
}

export function sleepForTerminationPoll(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function collectManagementSessions(adapters: DaemonPtyAdapter[]): Promise<{
  sessions: OwnedSession[]
  inventoryStatus: InventoryStatus
  failedAdapters: Set<DaemonPtyAdapter>
  adapterIdentities: Map<DaemonPtyAdapter, DaemonEndpointIdentity | null>
}> {
  const results = await Promise.allSettled(
    adapters.map(async (adapter) => {
      const sessions = await adapter.listSessions()
      const ownerIdentity = adapter.getLastAuthenticatedDaemonIdentity()
      return {
        identity: ownerIdentity,
        sessions: sessions.map<OwnedSession>((session) => {
          const parsed = parsePtySessionId(session.sessionId)
          const worktreeId = session.sessionId.startsWith(
            `${FLOATING_TERMINAL_WORKTREE_ID}${PTY_SESSION_ID_SEPARATOR}`
          )
            ? FLOATING_TERMINAL_WORKTREE_ID
            : parsed.worktreeId
          const agentOwnership =
            (session.agentSessionOwners?.length ?? 0) > 0
              ? 'present'
              : adapter.providesAgentSessionOwnerListings(session.sessionId)
                ? 'absent'
                : 'unknown'
          return {
            owner: adapter,
            ownerIdentity,
            session: {
              ...session,
              protocolVersion: adapter.protocolVersion,
              agentOwnership,
              ...(worktreeId ? { worktreeId } : {})
            }
          }
        })
      }
    })
  )
  return {
    sessions: results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.sessions : []
    ),
    failedAdapters: new Set(
      adapters.filter((_adapter, index) => results[index]?.status === 'rejected')
    ),
    adapterIdentities: new Map(
      adapters.flatMap((adapter, index) => {
        const result = results[index]
        return result?.status === 'fulfilled' ? [[adapter, result.value.identity] as const] : []
      })
    ),
    inventoryStatus:
      adapters.length > 0 && results.every((result) => result.status === 'fulfilled')
        ? 'complete'
        : 'unverifiable'
  }
}

export function sameKnownDaemonIdentity(
  expected: DaemonEndpointIdentity | null,
  current: DaemonEndpointIdentity | null | undefined
): boolean {
  return (
    expected !== null &&
    current !== null &&
    current !== undefined &&
    sameEndpointIdentity(expected, current)
  )
}

export async function resolveManagementSessionCwds(
  sessions: OwnedSession[]
): Promise<ManagementSession[]> {
  const resolved = sessions.map(({ session }) => ({ ...session }))
  // Only the displayed inventory needs cwd probes, not termination verification polls.
  for (let start = 0; start < sessions.length; start += 4) {
    await Promise.all(
      sessions.slice(start, start + 4).map(async ({ session, owner, ownerIdentity }, offset) => {
        if (
          session.cwd ||
          !session.isAlive ||
          !sameKnownDaemonIdentity(ownerIdentity, owner.getLastAuthenticatedDaemonIdentity())
        ) {
          return
        }
        try {
          const cwd = await owner.getCwd(session.sessionId)
          if (
            cwd &&
            sameKnownDaemonIdentity(ownerIdentity, owner.getLastAuthenticatedDaemonIdentity())
          ) {
            resolved[start + offset].cwd = cwd
          }
        } catch {
          // A missing cwd must not hide a session or disable otherwise verified inventory.
        }
      })
    )
  }
  return resolved
}

export function sameSessionIncarnation(
  session: Pick<DaemonSessionInfo, 'incarnationId'>,
  incarnationId?: string
): boolean {
  return incarnationId === undefined || session.incarnationId === incarnationId
}

export async function verifyManagementSessionExit(
  owner: DaemonPtyAdapter,
  sessionId: string,
  incarnationId: string | undefined,
  ownerIdentity: DaemonEndpointIdentity | null
): Promise<TerminationStatus> {
  if (!ownerIdentity) {
    return 'unverifiable'
  }
  let lastStatus: TerminationStatus = 'unverifiable'
  for (let attempt = 0; attempt < MAX_TERMINATION_POLL_ATTEMPTS; attempt += 1) {
    try {
      const sessions = await owner.listSessions()
      if (!sameKnownDaemonIdentity(ownerIdentity, owner.getLastAuthenticatedDaemonIdentity())) {
        return 'unverifiable'
      }
      const current = sessions.find(
        (session) =>
          session.sessionId === sessionId && sameSessionIncarnation(session, incarnationId)
      )
      if (!current) {
        return 'exited'
      }
      lastStatus = 'live'
    } catch {
      lastStatus = 'unverifiable'
    }
    if (attempt + 1 < MAX_TERMINATION_POLL_ATTEMPTS) {
      await sleepForTerminationPoll(TERMINATION_POLL_INTERVAL_MS)
    }
  }
  return lastStatus
}

/** Sessions still live under the same daemon incarnation; owners that cannot prove it are named. */
export async function preflightOwnedSessions(sessions: OwnedSession[]): Promise<{
  liveSessions: OwnedSession[]
  unverifiableOwners: Set<DaemonPtyAdapter>
}> {
  const unverifiableOwners = new Set<DaemonPtyAdapter>()
  const sessionsByOwner = new Map<DaemonPtyAdapter, OwnedSession[]>()
  for (const owned of sessions) {
    const group = sessionsByOwner.get(owned.owner) ?? []
    group.push(owned)
    sessionsByOwner.set(owned.owner, group)
  }
  const results = await Promise.all(
    [...sessionsByOwner].map(async ([owner, ownedSessions]) => {
      try {
        const live = await owner.listSessions()
        const currentIdentity = owner.getLastAuthenticatedDaemonIdentity()
        if (!sameKnownDaemonIdentity(ownedSessions[0].ownerIdentity, currentIdentity)) {
          unverifiableOwners.add(owner)
          return []
        }
        return ownedSessions.filter(({ session }) =>
          live.some(
            (candidate) =>
              candidate.sessionId === session.sessionId &&
              sameSessionIncarnation(candidate, session.incarnationId)
          )
        )
      } catch {
        unverifiableOwners.add(owner)
        return []
      }
    })
  )
  return { liveSessions: results.flat(), unverifiableOwners }
}
