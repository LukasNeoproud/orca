import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getExternalEditorOpenCapability } from '@/lib/external-editor-open-capability'
import { getLocalPathOpenOwnerForRoute } from '@/lib/local-path-open-guard'
import { showOpenFailureToast } from '@/components/sidebar/worktree-open-failure-toast'
import type { ShellOpenExternalEditorResult } from '../../../../shared/shell-open-types'
import type { ExternalEditorFileTarget } from './external-editor-file-target'
import { rememberExternalEditorApplication } from './external-editor-last-application'

type OpenFailure = Exclude<ShellOpenExternalEditorResult, { ok: true }>

function showFileOpenFailureToast(failure: OpenFailure, label: string, remote: boolean): void {
  if (failure.reason === 'not-found') {
    toast.error(
      translate(
        'auto.lib.reveal.in.file.manager.notFound',
        'File not found. It may have been moved or deleted.'
      )
    )
    return
  }
  if (failure.reason === 'launch-failed' && !remote) {
    toast.error(
      translate(
        'components.openInExternalEditor.launchFailed',
        'Could not open the file in {{value0}}.',
        {
          value0: label
        }
      ),
      {
        description: translate(
          'components.openInExternalEditor.launchFailedDetail',
          'Check the command configured for this app in Settings.'
        )
      }
    )
    return
  }
  showOpenFailureToast(failure, remote)
}

/** Opens the file in `application` at the line, and remembers the choice for its repository. */
export async function openFileInExternalEditor(args: {
  target: ExternalEditorFileTarget
  application: { id: string; label: string; command: string }
  line?: number
  column?: number
}): Promise<void> {
  const { target, application } = args
  const remote = Boolean(target.connectionId?.trim())
  const capability = getExternalEditorOpenCapability({ ...target, command: application.command })
  if (!capability.allowed) {
    showOpenFailureToast(
      {
        ok: false,
        reason:
          capability.reason === 'remote-runtime'
            ? 'remote-runtime-unsupported'
            : 'remote-editor-unsupported'
      },
      remote
    )
    return
  }
  const owner = getLocalPathOpenOwnerForRoute(target)
  // Why: the capability check refuses an unresolved owner, so this only narrows the type.
  if (owner === 'unresolved') {
    return
  }
  const result = await window.api.shell.openInExternalEditor({
    path: target.filePath,
    line: args.line,
    column: args.column,
    command: application.command,
    connectionId: target.connectionId,
    ownerHostId: owner
  })
  if (!result.ok) {
    showFileOpenFailureToast(result, application.label, remote)
    return
  }
  rememberExternalEditorApplication(target.preferenceKey, application.id)
}
