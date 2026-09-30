import type { OrcaInteractionRequest, OrcaInteractionResult } from './orca-interaction'

export const TERMINAL_INTERACTION_WAIT_MAX_MS = 25_000
export const TERMINAL_INTERACTION_DEFAULT_TIMEOUT_MS = 60 * 60_000

export type TerminalInteractionCaller = {
  terminalHandle: string
  paneKey: string
}

export type TerminalInteractionRequestParams = {
  caller: TerminalInteractionCaller
  requestId: string
  request: OrcaInteractionRequest
}

export type TerminalInteractionWaitParams = {
  caller: TerminalInteractionCaller
  requestId: string
  timeoutMs: number
}

export type TerminalInteractionCancelParams = {
  caller: TerminalInteractionCaller
  requestId: string
}

export type TerminalInteractionRespondParams = {
  requestId: string
  result: OrcaInteractionResult
}

export type TerminalInteractionPendingRequest = {
  requestId: string
  terminalHandle: string
  paneKey: string
  terminalTitle?: string
  request: OrcaInteractionRequest
  createdAt: number
}

export type TerminalInteractionPendingStatus = {
  requestId: string
  status: 'pending'
}

export type TerminalInteractionCompletedStatus = {
  requestId: string
  status: 'completed'
  result: OrcaInteractionResult
}

export type TerminalInteractionStatus =
  | TerminalInteractionPendingStatus
  | TerminalInteractionCompletedStatus
