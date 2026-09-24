import type { TerminalLiveAccessoryLocalEdit } from './terminal-live-text-commit'

export type TerminalLiveAccessoryInput = {
  readonly bytes: string
  readonly localEdit?: TerminalLiveAccessoryLocalEdit
  readonly resetMirrorBeforeSend?: boolean
}

type TerminalLiveAccessoryKey = {
  readonly bytes?: string
  readonly id: string
}

export function createTerminalLiveAccessoryInput(
  key: TerminalLiveAccessoryKey
): TerminalLiveAccessoryInput {
  if (key.bytes === undefined) {
    throw new Error(`Modifier ${key.id} has no terminal bytes`)
  }
  if (key.id === 'backspace' || key.id === 'delete') {
    return { bytes: key.bytes, localEdit: key.id }
  }

  return { bytes: key.bytes }
}
