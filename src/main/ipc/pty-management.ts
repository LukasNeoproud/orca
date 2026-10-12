import { ipcMain } from 'electron'
import { DegradedDaemonPtyProvider } from '../daemon/degraded-daemon-pty-provider'
import type { DaemonPtyAdapter } from '../daemon/daemon-pty-adapter'
import {
  getCurrentDaemonMacTccAttributionHealth,
  getDaemonProvider,
  restartDaemon
} from '../daemon/daemon-init'
import { getAllDaemonAdapters, getCurrentDaemonAdapter } from '../daemon/daemon-provider-routing'
import {
  getDaemonFolderAccessMismatch,
  refreshDaemonFolderAccessProbe,
  type DaemonFolderAccessMismatchNotice
} from '../daemon/daemon-folder-access-mismatch'
import {
  resetFolderAccessForDaemon,
  type DaemonFolderAccessResetResult
} from '../daemon/daemon-folder-access-reset'
import type { MacDaemonTccAttributionHealth } from '../daemon/daemon-tcc-attribution'
import {
  collectManagementSessions,
  resolveManagementSessionCwds,
  MAX_TERMINATION_POLL_ATTEMPTS,
  sameKnownDaemonIdentity,
  sameSessionIncarnation,
  sleepForTerminationPoll,
  TERMINATION_POLL_INTERVAL_MS,
  verifyManagementSessionExit,
  type InventoryStatus,
  type ManagementSession,
  type OwnedSession,
  type TerminationStatus
} from './pty-management-inventory'
import type { DaemonEndpointIdentity } from '../daemon/daemon-hello-protocol'

function getDaemonAdapters(): DaemonPtyAdapter[] {
  const provider = getDaemonProvider()
  return provider ? [...getAllDaemonAdapters(provider)] : []
}

// Why: surface degraded mode (daemon alive but cannot spawn fresh PTYs) so the UI can warn new terminals lack persistence.
function isDaemonDegraded(): boolean {
  const provider = getDaemonProvider()
  return (
    provider instanceof DegradedDaemonPtyProvider &&
    provider.routesFreshSpawnsToLocalProvider === true
  )
}

// Why the current adapter only: evidence is keyed to the daemon now spawning terminals, so a
// legacy adapter's daemon must never satisfy the identity match that keeps the notice up.
function readCurrentDaemonIdentity(): DaemonEndpointIdentity | null {
  const provider = getDaemonProvider()
  return provider ? getCurrentDaemonAdapter(provider).getDaemonIdentity() : null
}

export function registerDaemonManagementHandlers(): void {
  ipcMain.removeHandler('pty:management:listSessions')
  ipcMain.removeHandler('pty:management:killAll')
  ipcMain.removeHandler('pty:management:killOne')
  ipcMain.removeHandler('pty:management:restart')
  ipcMain.removeHandler('pty:management:macTccAttribution')
  ipcMain.removeHandler('pty:management:resetFolderAccess')

  // Why: lets Settings warn that macOS privacy grants no longer reach daemon terminals (STA-3491),
  // and carries the folder-access evidence the notice needs (STA-7948) on the same focus-time poll.
  ipcMain.handle(
    'pty:management:macTccAttribution',
    async (): Promise<{
      health: MacDaemonTccAttributionHealth
      folderAccessMismatch: DaemonFolderAccessMismatchNotice | null
    }> => {
      // Why two guards: the two answers are independent evidence, and a failed health read must
      // not present as "the folder evidence is gone".
      const health = await getCurrentDaemonMacTccAttributionHealth().catch(
        (): MacDaemonTccAttributionHealth => 'unknown'
      )
      const identity = readCurrentDaemonIdentity()
      // Why re-probe on the poll: the fix dialog's first step completes in System Settings, and
      // returning to Orca is the only moment anything can notice. The refresh owns when to skip.
      await refreshDaemonFolderAccessProbe(identity).catch(() => {})
      return { health, folderAccessMismatch: getDaemonFolderAccessMismatch(identity) }
    }
  )

  // Why a separate channel from the poll: this one has a side effect — it clears Orca's TCC row and
  // makes the app touch the folder so macOS re-prompts — and only a user click may trigger it.
  ipcMain.handle(
    'pty:management:resetFolderAccess',
    async (): Promise<DaemonFolderAccessResetResult> => {
      try {
        return await resetFolderAccessForDaemon(readCurrentDaemonIdentity())
      } catch {
        return { outcome: 'unsupported' }
      }
    }
  )

  ipcMain.handle(
    'pty:management:listSessions',
    async (): Promise<{
      sessions: ManagementSession[]
      degraded: boolean
      inventoryStatus: InventoryStatus
    }> => {
      const inventory = await collectManagementSessions(getDaemonAdapters())
      return {
        sessions: await resolveManagementSessionCwds(inventory.sessions),
        degraded: isDaemonDegraded(),
        inventoryStatus: inventory.inventoryStatus
      }
    }
  )

  // Why: tears down sessions across all adapters (current + legacy); daemon processes survive. See docs/daemon-staleness-ux.md §Phase 1.
  ipcMain.handle(
    'pty:management:killAll',
    async (): Promise<{
      killedCount: number
      remainingCount: number
      killedSessionIds: string[]
      status: TerminationStatus
      inventoryStatus: InventoryStatus
    }> => {
      const adapters = getDaemonAdapters()
      // Why: snapshot session IDs up front so mid-kill respawns aren't counted as "remaining".
      const initial = await collectManagementSessions(adapters)
      const initialIds = new Set(initial.sessions.map(({ session }) => session.sessionId))
      const initialCount = initial.sessions.length

      if (initialCount === 0) {
        return {
          killedCount: 0,
          remainingCount: 0,
          killedSessionIds: [],
          status: initial.inventoryStatus === 'complete' ? 'exited' : 'unverifiable',
          inventoryStatus: initial.inventoryStatus
        }
      }

      const preflightUnverifiableAdapters = new Set<DaemonPtyAdapter>()
      const sessionsByOwner = new Map<DaemonPtyAdapter, OwnedSession[]>()
      for (const owned of initial.sessions) {
        const sessions = sessionsByOwner.get(owned.owner) ?? []
        sessions.push(owned)
        sessionsByOwner.set(owned.owner, sessions)
      }
      const preflightResults = await Promise.all(
        [...sessionsByOwner].map(async ([owner, ownedSessions]) => {
          try {
            const live = await owner.listSessions()
            const currentIdentity = owner.getLastAuthenticatedDaemonIdentity()
            if (!sameKnownDaemonIdentity(ownedSessions[0].ownerIdentity, currentIdentity)) {
              preflightUnverifiableAdapters.add(owner)
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
            preflightUnverifiableAdapters.add(owner)
            return []
          }
        })
      )

      // Why: no retry — session.kill() is idempotent and runs its own kill ladder; allSettled so one rejection doesn't abort the rest.
      await Promise.allSettled(
        preflightResults.flat().map(async ({ session, owner }) => {
          // Why: immediate=true only matters to legacy/future adapters; swallow rejections since remainingCount reports stuck sessions.
          await owner.shutdown(session.sessionId, { immediate: true }).catch(() => {})
        })
      )

      // Why: count only the initial-snapshot intersection so renderer respawns mid-kill aren't counted as remaining.
      let remainingOriginalCount = initialCount
      let remainingOriginalIds = initialIds
      let inventoryStatus = initial.inventoryStatus
      if (preflightUnverifiableAdapters.size > 0) {
        inventoryStatus = 'unverifiable'
      }
      for (let attempt = 0; attempt < MAX_TERMINATION_POLL_ATTEMPTS; attempt += 1) {
        await sleepForTerminationPoll(TERMINATION_POLL_INTERVAL_MS)
        const current = await collectManagementSessions(adapters)
        if (current.inventoryStatus === 'unverifiable') {
          inventoryStatus = 'unverifiable'
        }
        remainingOriginalIds = new Set([
          ...current.sessions
            .filter(({ session }) => initialIds.has(session.sessionId))
            .map(({ session }) => session.sessionId),
          ...initial.sessions
            .filter(
              ({ owner, ownerIdentity }) =>
                preflightUnverifiableAdapters.has(owner) ||
                current.failedAdapters.has(owner) ||
                !sameKnownDaemonIdentity(ownerIdentity, current.adapterIdentities.get(owner))
            )
            .map(({ session }) => session.sessionId)
        ])
        remainingOriginalCount = remainingOriginalIds.size
        if (remainingOriginalCount === 0 && current.inventoryStatus === 'complete') {
          break
        }
      }

      const killedCount = inventoryStatus === 'complete' ? initialCount - remainingOriginalCount : 0
      return {
        killedCount,
        remainingCount: remainingOriginalCount,
        killedSessionIds:
          inventoryStatus === 'complete'
            ? [...initialIds].filter((sessionId) => !remainingOriginalIds.has(sessionId))
            : [],
        status:
          inventoryStatus === 'unverifiable'
            ? 'unverifiable'
            : remainingOriginalCount === 0
              ? 'exited'
              : 'live',
        inventoryStatus
      }
    }
  )

  ipcMain.handle(
    'pty:management:killOne',
    async (
      _event,
      args: { sessionId: string; incarnationId?: string }
    ): Promise<{ success: boolean; status: TerminationStatus }> => {
      if (
        typeof args?.sessionId !== 'string' ||
        args.sessionId.length === 0 ||
        args.sessionId.length > 512 ||
        (args.incarnationId !== undefined &&
          (typeof args.incarnationId !== 'string' || args.incarnationId.length === 0))
      ) {
        return { success: false, status: 'unverifiable' }
      }
      const adapters = getDaemonAdapters()
      const inventory = await collectManagementSessions(adapters)
      const match = inventory.sessions.find(({ session }) => session.sessionId === args.sessionId)
      if (!match) {
        // The UI selection does not carry its daemon endpoint identity. A complete inventory of
        // the current endpoints cannot prove a session selected from a superseded daemon exited.
        return { success: false, status: 'unverifiable' }
      }
      const expectedIncarnationId = args.incarnationId ?? match.session.incarnationId
      if (!sameSessionIncarnation(match.session, args.incarnationId)) {
        return { success: false, status: 'live' }
      }

      // Why: close the list→kill window enough to reject an already-replaced ID. The daemon RPC
      // is ID-only, so this is a best available identity fence until the wire supports a CAS kill.
      try {
        const preKill = (await match.owner.listSessions()).find(
          (session) => session.sessionId === args.sessionId
        )
        if (
          !sameKnownDaemonIdentity(
            match.ownerIdentity,
            match.owner.getLastAuthenticatedDaemonIdentity()
          )
        ) {
          return { success: false, status: 'unverifiable' }
        }
        if (!preKill) {
          return { success: false, status: 'exited' }
        }
        if (!sameSessionIncarnation(preKill, expectedIncarnationId)) {
          return { success: false, status: 'live' }
        }
        await match.owner.shutdown(args.sessionId, { immediate: true })
      } catch {
        // A rejected request can still race a successful signal; verify the durable inventory.
      }
      const status = await verifyManagementSessionExit(
        match.owner,
        args.sessionId,
        expectedIncarnationId,
        match.ownerIdentity
      )
      return { success: status === 'exited', status }
    }
  )

  ipcMain.handle('pty:management:restart', async (): Promise<{ success: boolean }> => {
    try {
      await restartDaemon()
      return { success: true }
    } catch (err) {
      console.error('[pty:management] restart failed', err)
      return { success: false }
    }
  })
}
