import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from '../../persistence'
import type {
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult
} from '../../../shared/project-types'
import { linkRepoToProjectHostSetup } from '../../project-host-setup-link'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { prepareLocalWorktreeRootForRepo } from '../../worktree-root-preparation'
import { invalidateAuthorizedRootsCache } from '../registered-worktree-roots-cache'
import { emitRepoAdded } from './repo-added-telemetry'
import { notifyReposChanged } from './repos-changed-notification'
import {
  ProjectHostSetupCreateIpcArgs,
  ProjectHostSetupDeleteIpcArgs,
  ProjectHostSetupExistingFolderIpcArgs,
  ProjectHostSetupUpdateIpcArgs,
  parseProjectGroupIpcArgs
} from './repo-ipc-arg-schemas'
import { addLocalRepoFromPath } from './local-repo-registration'
import { sshTargetNotConnectedMessage } from '../../providers/ssh-host-not-served-error'

export function registerProjectHostSetupHandlers(mainWindow: BrowserWindow, store: Store): void {
  ipcMain.handle(
    'projectHostSetups:create',
    (_event, rawArgs: ProjectHostSetupCreateArgs): ProjectHostSetupCreateResult => {
      const args = parseProjectGroupIpcArgs(
        ProjectHostSetupCreateIpcArgs,
        rawArgs,
        'project_host_setup_create_invalid_args'
      )
      const result = store.createProjectHostSetup(args)
      if (!result) {
        throw new Error(`Project not found: ${args.projectId}`)
      }
      notifyReposChanged(mainWindow)
      return result
    }
  )

  ipcMain.handle(
    'projectHostSetups:update',
    (_event, rawArgs: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult => {
      const args = parseProjectGroupIpcArgs(
        ProjectHostSetupUpdateIpcArgs,
        rawArgs,
        'project_host_setup_update_invalid_args'
      )
      const result = store.updateProjectHostSetup(args)
      if (!result) {
        throw new Error(`Project host setup not found: ${args.setupId}`)
      }
      if ('worktreeBasePath' in args.updates && result.repo) {
        void prepareLocalWorktreeRootForRepo(store, result.repo)
        invalidateAuthorizedRootsCache()
      }
      notifyReposChanged(mainWindow)
      return result
    }
  )

  ipcMain.handle(
    'projectHostSetups:delete',
    (_event, rawArgs: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult => {
      const args = parseProjectGroupIpcArgs(
        ProjectHostSetupDeleteIpcArgs,
        rawArgs,
        'project_host_setup_delete_invalid_args'
      )
      const result = store.deleteProjectHostSetup(args)
      if (!result) {
        throw new Error(`Project host setup not found: ${args.setupId}`)
      }
      notifyReposChanged(mainWindow)
      return result
    }
  )

  ipcMain.handle(
    'projectHostSetups:setupExistingFolder',
    async (
      _event,
      rawArgs: ProjectHostSetupExistingFolderArgs
    ): Promise<ProjectHostSetupResult> => {
      const args = parseProjectGroupIpcArgs(
        ProjectHostSetupExistingFolderIpcArgs,
        rawArgs,
        'project_host_setup_invalid_args'
      )
      const parsedHost = parseExecutionHostId(args.hostId)
      if (!parsedHost) {
        throw new Error(`Unsupported host: ${args.hostId}`)
      }
      const result =
        parsedHost.kind === 'local'
          ? await addLocalRepoFromPath(store, args.path, args.kind)
          : parsedHost.kind === 'ssh'
            ? { error: sshTargetNotConnectedMessage(parsedHost.targetId) }
            : {
                error:
                  'Runtime hosts must be set up through the runtime projectHostSetup.setupExistingFolder RPC.'
              }
      if ('error' in result) {
        throw new Error(result.error)
      }
      let aligned: ProjectHostSetupResult
      try {
        aligned = linkRepoToProjectHostSetup(store, result.repo, { ...args, hostId: parsedHost.id })
      } catch (err) {
        // Why: an import that cannot be linked must not leave a new repo registration or authorization root behind.
        if (!result.alreadyExisted) {
          store.removeProjectForHost(result.repo.id, getRepoExecutionHostId(result.repo))
          invalidateAuthorizedRootsCache()
        }
        throw err
      }
      invalidateAuthorizedRootsCache()
      notifyReposChanged(mainWindow)
      emitRepoAdded('folder_picker', result.alreadyExisted)
      if (result.alreadyExisted) {
        await prepareLocalWorktreeRootForRepo(store, aligned.repo)
      }
      return aligned
    }
  )
}
