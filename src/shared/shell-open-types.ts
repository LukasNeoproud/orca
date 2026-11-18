import type { ExecutionHostId } from './execution-host'

export type ShellOpenExternalEditorRequest = {
  path: string
  /** 1-based line of the file at `path`; main ignores it for editors it cannot place a cursor in. */
  line?: number
  /** 1-based column on `line`; only honored together with `line`. */
  column?: number
  command?: string
  connectionId?: string | null
  /** Host that owns `path`; main refuses unless it is `local` or, with `connectionId`, that SSH host. */
  ownerHostId: ExecutionHostId
}

export type ShellOpenPathFailureReason =
  | 'not-absolute'
  | 'not-found'
  | 'launch-failed'
  | 'remote-runtime-unsupported'
  | 'ssh-target-not-found'
  | 'ssh-target-invalid'
  | 'ssh-alias-required'
  | 'remote-editor-unsupported'

export type ShellOpenLocalPathFailureReason = Extract<
  ShellOpenPathFailureReason,
  'not-absolute' | 'not-found' | 'launch-failed' | 'remote-runtime-unsupported'
>

export type ShellOpenLocalPathResult =
  | { ok: true }
  | { ok: false; reason: ShellOpenLocalPathFailureReason }

export type ShellOpenExternalEditorResult =
  | { ok: true }
  | { ok: false; reason: Exclude<ShellOpenPathFailureReason, 'ssh-alias-required'> }
  | { ok: false; reason: 'ssh-alias-required'; host: string; port: number }
