import { parseExecutionHostId } from '../../../shared/execution-host'
import type { BacklogBoardBinding } from '../../../shared/backlog-board-binding'
import type { BacklogBoard } from '../../../shared/backlog-types'
import { useAppStore } from '@/store'
import { backlogRouteKey, callBacklog, resolveBacklogRoute, type BacklogRoute } from './backlog-rpc'
import { openWorkspaceBrowserTab } from './workspace-browser-tab-open'
import { resolveWorktreeOperationRouteForHost } from './worktree-operation-route'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { webviewRegistry } from '@/components/browser-pane/host-guest/webview-registry'
import { createBrowserUuid } from '@/lib/browser-uuid'

const BOARD_RENEW_MS = 20_000
const pendingOpens = new Map<string, Promise<void>>()
const pendingAcquires = new Map<string, Promise<string>>()
const leases = new Map<
  string,
  {
    route: BacklogRoute
    leaseId: string
    instanceId: string
    timer: ReturnType<typeof setInterval>
  }
>()
const errors = new Map<string, string>()
const errorListeners = new Set<() => void>()

function notifyBoardState(): void {
  for (const listener of errorListeners) {
    listener()
  }
}

export function subscribeBacklogBoardErrors(listener: () => void): () => void {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

export function getBacklogBoardError(pageId: string): string | null {
  return errors.get(pageId) ?? null
}

export function isBacklogBoardVerified(pageId: string): boolean {
  return leases.has(pageId)
}

function setBoardError(pageId: string, error: unknown): void {
  const message = error === null ? null : error instanceof Error ? error.message : String(error)
  if (message === null) {
    errors.delete(pageId)
  } else {
    errors.set(pageId, message)
  }
  notifyBoardState()
}

function bindingMatches(
  binding: BacklogBoardBinding | null | undefined,
  route: BacklogRoute
): boolean {
  return !!binding && backlogRouteKey(binding) === backlogRouteKey(route)
}

function findBoundPage(route: BacklogRoute): { id: string; workspaceId: string } | null {
  for (const [workspaceId, pages] of Object.entries(
    useAppStore.getState().browserPagesByWorkspace
  )) {
    const page = pages.find((candidate) => bindingMatches(candidate.backlogBoardBinding, route))
    if (page) {
      return { id: page.id, workspaceId }
    }
  }
  return null
}

function findPage(pageId: string) {
  return Object.values(useAppStore.getState().browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === pageId)
}

async function navigateBoardPage(
  route: BacklogRoute,
  pageId: string,
  url: string,
  force: boolean
): Promise<void> {
  const state = useAppStore.getState()
  const page = findPage(pageId)
  if (!page || !bindingMatches(page.backlogBoardBinding, route)) {
    throw new Error('The Backlog.md board tab was closed.')
  }
  if (page.url === url && !force) {
    return
  }
  if (route.runtimeEnvironmentId) {
    const remotePageId =
      state.remoteBrowserPageHandlesByPageId[pageId]?.remotePageId ?? page.remoteBrowserPageId
    if (!remotePageId) {
      throw new Error('The remote Backlog.md board tab is unavailable.')
    }
    await callRuntimeRpc(
      { kind: 'environment', environmentId: route.runtimeEnvironmentId },
      'browser.goto',
      { worktree: toRuntimeWorktreeSelector(route.workspaceId), page: remotePageId, url },
      { timeoutMs: 15_000 }
    )
  }
  if (page.url === url) {
    webviewRegistry.get(pageId)?.reload()
  } else {
    useAppStore.getState().setBrowserPageUrl(pageId, url)
  }
}

let closeObserverInstalled = false
function ensureCloseObserver(): void {
  if (closeObserverInstalled || typeof useAppStore.subscribe !== 'function') {
    return
  }
  closeObserverInstalled = true
  useAppStore.subscribe((state, previous) => {
    if (!leases.size || state.browserPagesByWorkspace === previous.browserPagesByWorkspace) {
      return
    }
    for (const [pageId, lease] of leases) {
      const page = findPage(pageId)
      if (page && bindingMatches(page.backlogBoardBinding, lease.route)) {
        continue
      }
      clearInterval(lease.timer)
      leases.delete(pageId)
      notifyBoardState()
      setBoardError(pageId, null)
      void callBacklog(lease.route, 'releaseBoard', { leaseId: lease.leaseId }).catch(() => {})
    }
  })
}

function retainBoard(
  route: BacklogRoute,
  pageId: string,
  leaseId: string,
  instanceId: string
): void {
  ensureCloseObserver()
  if (leases.has(pageId)) {
    return
  }
  const renew = (): void => {
    void acquireBoundBacklogBoard(route, pageId).catch(() => {})
  }
  leases.set(pageId, { route, leaseId, instanceId, timer: setInterval(renew, BOARD_RENEW_MS) })
  notifyBoardState()
}

export async function acquireBoundBacklogBoard(
  binding: BacklogBoardBinding,
  pageId: string
): Promise<string> {
  const current = resolveWorktreeOperationRouteForHost(
    useAppStore.getState(),
    binding.workspaceId,
    binding.executionHostId
  )
  if (current?.runtimeEnvironmentId !== binding.runtimeEnvironmentId) {
    const error = new Error('The workspace execution host changed. Reopen the Backlog.md board.')
    setBoardError(pageId, error)
    throw error
  }
  const pending = pendingAcquires.get(pageId)
  if (pending) {
    return pending
  }
  const acquiring = acquireBoardForPage(binding, pageId).finally(() =>
    pendingAcquires.delete(pageId)
  )
  pendingAcquires.set(pageId, acquiring)
  return acquiring
}

async function acquireBoardForPage(route: BacklogRoute, pageId: string): Promise<string> {
  const existingLease = leases.get(pageId)
  const leaseId = existingLease?.leaseId ?? createBrowserUuid()
  try {
    const board = await callBacklog<BacklogBoard>(route, 'acquireBoard', { leaseId })
    if (!board.url) {
      throw new Error('Backlog.md did not return a board URL.')
    }
    await navigateBoardPage(
      route,
      pageId,
      board.url,
      !!existingLease && existingLease.instanceId !== board.instanceId
    )
    if (existingLease) {
      existingLease.instanceId = board.instanceId
    } else {
      retainBoard(route, pageId, leaseId, board.instanceId)
    }
    setBoardError(pageId, null)
    return board.url
  } catch (error) {
    if (!existingLease) {
      void callBacklog(route, 'releaseBoard', { leaseId }).catch(() => {})
    }
    setBoardError(pageId, error)
    throw error
  }
}

async function openBoard(route: BacklogRoute, targetGroupId?: string): Promise<void> {
  const existing = findBoundPage(route)
  if (existing) {
    const state = useAppStore.getState()
    await acquireBoundBacklogBoard(route, existing.id)
    state.setActiveWorktree(route.workspaceId, route.executionHostId)
    useAppStore.getState().focusBrowserTabInWorktree(route.workspaceId, existing.id)
    return
  }

  const leaseId = createBrowserUuid()
  const board = await callBacklog<BacklogBoard>(route, 'acquireBoard', { leaseId })
  if (!board.url) {
    throw new Error('Backlog.md did not return a board URL.')
  }
  if (backlogRouteKey(resolveBacklogRoute(route.workspaceId)) !== backlogRouteKey(route)) {
    void callBacklog(route, 'releaseBoard', { leaseId }).catch(() => {})
    throw new Error('The workspace execution host changed while opening Backlog.md.')
  }
  const host = parseExecutionHostId(route.executionHostId)
  try {
    await openWorkspaceBrowserTab({
      workspaceId: route.workspaceId,
      targetGroupId,
      url: board.url,
      title: 'Backlog.md',
      intent: { kind: 'url' },
      backlogBoardBinding: route,
      ...(route.runtimeEnvironmentId
        ? {
            expectedRuntimeEnvironmentId: route.runtimeEnvironmentId,
            placementPreference: 'server' as const
          }
        : host?.kind === 'ssh'
          ? { expectedSshConnectionId: host.targetId }
          : {})
    })
    const created = findBoundPage(route)
    if (!created) {
      throw new Error('Backlog.md board tab did not materialize.')
    }
    retainBoard(route, created.id, leaseId, board.instanceId)
  } catch (error) {
    void callBacklog(route, 'releaseBoard', { leaseId }).catch(() => {})
    throw error
  }
}

export function openBacklogBoard(workspaceId: string, targetGroupId?: string): Promise<void> {
  const route = resolveBacklogRoute(workspaceId)
  const key = backlogRouteKey(route)
  const pending = pendingOpens.get(key)
  if (pending) {
    return pending
  }
  const opening = openBoard(route, targetGroupId).finally(() => pendingOpens.delete(key))
  pendingOpens.set(key, opening)
  return opening
}
