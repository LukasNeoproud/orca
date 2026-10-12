import type { BacklogBoardBinding } from '../../shared/backlog-board-binding'
import type { PersistedHeadlessBacklogBoardPage } from '../../shared/headless-backlog-board-page'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import type { BrowserBackend } from '../browser/browser-backend'
import { getRuntimeBrowserPageRegistry } from './runtime-browser-page-registry'

const liveBindings = new WeakMap<WeakKey, Map<string, BacklogBoardBinding>>()
const restoringPages = new WeakMap<WeakKey, Set<string>>()

export function collectHeadlessBacklogBoardWorktreeIds(
  sessions: Iterable<WorkspaceSessionState | null | undefined>
): Set<string> {
  const worktreeIds = new Set<string>()
  for (const session of sessions) {
    for (const worktreeId of Object.keys(session?.headlessBacklogBoardPagesByWorktree ?? {})) {
      worktreeIds.add(worktreeId)
    }
  }
  return worktreeIds
}

export function getHeadlessBacklogBoardBinding(
  owner: WeakKey,
  pageId: string
): BacklogBoardBinding | undefined {
  return liveBindings.get(owner)?.get(pageId)
}

export function rememberHeadlessBacklogBoardPage(
  owner: WeakKey,
  worktreeId: string,
  page: PersistedHeadlessBacklogBoardPage,
  getSession: (worktreeId: string) => WorkspaceSessionState | null,
  setSession: (worktreeId: string, session: WorkspaceSessionState) => void
): void {
  const session = getSession(worktreeId)
  if (!session) {
    throw new Error('workspace_session_unavailable')
  }
  const existing = session.headlessBacklogBoardPagesByWorktree?.[worktreeId] ?? []
  const rows = [...existing.filter((row) => row.browserPageId !== page.browserPageId), page]
  setSession(worktreeId, {
    ...session,
    headlessBacklogBoardPagesByWorktree: {
      ...session.headlessBacklogBoardPagesByWorktree,
      [worktreeId]: rows
    }
  })
  setLiveBinding(owner, page.browserPageId, page.backlogBoardBinding)
}

export function forgetHeadlessBacklogBoardPage(
  owner: WeakKey,
  worktreeId: string,
  pageId: string,
  getSession: (worktreeId: string) => WorkspaceSessionState | null,
  setSession: (worktreeId: string, session: WorkspaceSessionState) => void
): void {
  liveBindings.get(owner)?.delete(pageId)
  const session = getSession(worktreeId)
  if (!session) {
    return
  }
  const existing = session.headlessBacklogBoardPagesByWorktree?.[worktreeId] ?? []
  if (!existing.some((row) => row.browserPageId === pageId)) {
    return
  }
  const next = { ...session.headlessBacklogBoardPagesByWorktree }
  const rows = existing.filter((row) => row.browserPageId !== pageId)
  if (rows.length > 0) {
    next[worktreeId] = rows
  } else {
    delete next[worktreeId]
  }
  setSession(worktreeId, { ...session, headlessBacklogBoardPagesByWorktree: next })
}

export function setLiveBinding(owner: WeakKey, pageId: string, binding: BacklogBoardBinding): void {
  let bindings = liveBindings.get(owner)
  if (!bindings) {
    bindings = new Map()
    liveBindings.set(owner, bindings)
  }
  bindings.set(pageId, binding)
}

export async function restoreHeadlessBacklogBoardPages(
  owner: WeakKey,
  backend: BrowserBackend,
  worktreeIds: Iterable<string>,
  getSession: (worktreeId: string) => WorkspaceSessionState | null,
  notify: (worktreeId: string) => void
): Promise<void> {
  let inFlight = restoringPages.get(owner)
  if (!inFlight) {
    inFlight = new Set()
    restoringPages.set(owner, inFlight)
  }
  const restores: Promise<void>[] = []
  for (const worktreeId of worktreeIds) {
    const rows = getSession(worktreeId)?.headlessBacklogBoardPagesByWorktree?.[worktreeId] ?? []
    for (const row of rows) {
      if (
        getHeadlessBacklogBoardBinding(owner, row.browserPageId) ||
        inFlight.has(row.browserPageId)
      ) {
        continue
      }
      inFlight.add(row.browserPageId)
      restores.push(
        backend
          .createTab({
            browserPageId: row.browserPageId,
            worktreeId,
            profileId: row.browserProfileId,
            url: 'about:blank'
          })
          .then(() => {
            setLiveBinding(owner, row.browserPageId, row.backlogBoardBinding)
            notify(worktreeId)
          })
          .catch((error) => {
            console.warn('[backlog] could not restore board page', { worktreeId, error })
          })
          .finally(() => {
            inFlight!.delete(row.browserPageId)
          })
      )
    }
  }
  await Promise.all(restores)
}

// Headless and client-hosted board pages both publish their binding on the session tab.
export function withBacklogBoardBindings<T extends { browserPageId: string }>(
  owner: WeakKey,
  tabs: T[]
): (T & { backlogBoardBinding?: BacklogBoardBinding })[] {
  return tabs.map((tab) => {
    const binding =
      getHeadlessBacklogBoardBinding(owner, tab.browserPageId) ??
      getRuntimeBrowserPageRegistry(owner).getPage(tab.browserPageId)?.backlogBoardBinding
    return binding ? { ...tab, backlogBoardBinding: binding } : tab
  })
}
