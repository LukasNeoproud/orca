import type { RuntimeLocalWorktreeCreateArgs } from './runtime-local-worktree-create'

type RemoteTrackingDeps = Pick<
  RuntimeLocalWorktreeCreateArgs<unknown>,
  'resolveRemoteTrackingBase' | 'hasRemoteTrackingRef' | 'refreshRemoteTrackingBase' | 'fetchRemote'
>

/** Binds the runtime's cached remote-tracking probes for a local worktree create. */
export function runtimeRemoteTrackingDeps(runtime: {
  resolveRemoteTrackingBase: RemoteTrackingDeps['resolveRemoteTrackingBase']
  hasRemoteTrackingRef: RemoteTrackingDeps['hasRemoteTrackingRef']
  getOrStartRemoteTrackingBaseRefresh: RemoteTrackingDeps['refreshRemoteTrackingBase']
  fetchRemoteWithCache: RemoteTrackingDeps['fetchRemote']
}): RemoteTrackingDeps {
  return {
    resolveRemoteTrackingBase: (path, base, ...options) =>
      runtime.resolveRemoteTrackingBase(path, base, ...options),
    hasRemoteTrackingRef: (path, base, ...options) =>
      runtime.hasRemoteTrackingRef(path, base, ...options),
    refreshRemoteTrackingBase: (path, base, ...options) =>
      runtime.getOrStartRemoteTrackingBaseRefresh(path, base, ...options),
    fetchRemote: (path, remote, ...options) =>
      runtime.fetchRemoteWithCache(path, remote, ...options)
  }
}
