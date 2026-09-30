import { z } from 'zod'
import { OrcaInteractionRequestSchema } from '../../../../shared/orca-interaction'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { TERMINAL_INTERACTION_WAIT_MAX_MS } from '../../../../shared/terminal-interaction'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  getTerminalInteractionRegistry,
  type TerminalInteractionBinding
} from '../../terminal-interaction-registry'
import { defineMethod, type RpcAnyMethod } from '../core'

const InteractionCaller = z
  .object({
    terminalHandle: z.string().min(1).max(512),
    paneKey: z.string().min(1).max(512)
  })
  .strict()

const InteractionRequest = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512),
    request: OrcaInteractionRequestSchema
  })
  .strict()

const InteractionWait = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512),
    timeoutMs: z.number().int().min(0).max(TERMINAL_INTERACTION_WAIT_MAX_MS)
  })
  .strict()

const InteractionCancel = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512)
  })
  .strict()

const InteractionRespond = z
  .object({
    requestId: z.string().min(1).max(512),
    result: z.unknown()
  })
  .strict()

async function resolveBinding(
  runtime: OrcaRuntimeService,
  caller: { terminalHandle: string; paneKey: string }
): Promise<TerminalInteractionBinding> {
  const terminal = await runtime.showTerminal(caller.terminalHandle)
  let paneKey: string
  try {
    paneKey = makePaneKey(terminal.tabId, terminal.leafId)
  } catch {
    throw new Error('terminal_interaction_terminal_unavailable')
  }
  if (
    terminal.handle !== caller.terminalHandle ||
    paneKey !== caller.paneKey ||
    !terminal.connected ||
    !terminal.ptyId ||
    !terminal.incarnationId
  ) {
    throw new Error('terminal_interaction_terminal_unavailable')
  }
  return {
    terminalHandle: caller.terminalHandle,
    paneKey,
    ptyId: terminal.ptyId,
    incarnationId: terminal.incarnationId,
    ...(terminal.title ? { terminalTitle: terminal.title } : {})
  }
}

type BindingObservation =
  | { status: 'current'; binding: TerminalInteractionBinding }
  | { status: 'stale' }
  | { status: 'unavailable' }

function isDefinitiveTerminalAbsence(error: unknown): boolean {
  return (
    error instanceof Error &&
    ['terminal_handle_stale', 'terminal_not_found', 'terminal_gone', 'terminal_exited'].includes(
      error.message
    )
  )
}

async function observeBinding(
  runtime: OrcaRuntimeService,
  expected: TerminalInteractionBinding
): Promise<BindingObservation> {
  let terminal: Awaited<ReturnType<OrcaRuntimeService['showTerminal']>>
  try {
    terminal = await runtime.showTerminal(expected.terminalHandle)
  } catch (error) {
    return { status: isDefinitiveTerminalAbsence(error) ? 'stale' : 'unavailable' }
  }
  if (!terminal.connected) {
    return { status: 'unavailable' }
  }
  let paneKey: string
  try {
    paneKey = makePaneKey(terminal.tabId, terminal.leafId)
  } catch {
    return { status: 'stale' }
  }
  if (
    terminal.handle !== expected.terminalHandle ||
    paneKey !== expected.paneKey ||
    terminal.ptyId !== expected.ptyId ||
    terminal.incarnationId !== expected.incarnationId
  ) {
    return { status: 'stale' }
  }
  return {
    status: 'current',
    binding: {
      ...expected,
      ...(terminal.title ? { terminalTitle: terminal.title } : {})
    }
  }
}

async function resolveExistingBinding(
  runtime: OrcaRuntimeService,
  requestId: string,
  caller: { terminalHandle: string; paneKey: string }
): Promise<TerminalInteractionBinding> {
  const registry = getTerminalInteractionRegistry(runtime)
  const expected = registry.getPendingBinding(requestId)
  if (
    !expected ||
    expected.terminalHandle !== caller.terminalHandle ||
    expected.paneKey !== caller.paneKey
  ) {
    return resolveBinding(runtime, caller)
  }
  const observation = await observeBinding(runtime, expected)
  if (observation.status === 'stale') {
    registry.invalidate(requestId)
    throw new Error('terminal_interaction_caller_stale')
  }
  if (observation.status === 'unavailable') {
    throw new Error('terminal_interaction_terminal_unavailable')
  }
  return observation.binding
}

export const TERMINAL_INTERACTION_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'terminalInteraction.request',
    params: InteractionRequest,
    handler: async (params, { runtime }) =>
      getTerminalInteractionRegistry(runtime).request(
        params,
        await resolveBinding(runtime, params.caller)
      )
  }),
  defineMethod({
    name: 'terminalInteraction.wait',
    params: InteractionWait,
    handler: async (params, { runtime, signal }) =>
      getTerminalInteractionRegistry(runtime).wait(
        params.caller,
        params.requestId,
        await resolveExistingBinding(runtime, params.requestId, params.caller),
        { timeoutMs: params.timeoutMs, signal }
      )
  }),
  defineMethod({
    name: 'terminalInteraction.cancel',
    params: InteractionCancel,
    handler: async (params, { runtime }) =>
      getTerminalInteractionRegistry(runtime).cancel(
        params.caller,
        params.requestId,
        await resolveExistingBinding(runtime, params.requestId, params.caller)
      )
  }),
  defineMethod({
    name: 'terminalInteraction.pending',
    params: null,
    handler: async (_params, { runtime }) => {
      const registry = getTerminalInteractionRegistry(runtime)
      const snapshot = registry.pending()
      await Promise.all(
        snapshot.map(async ({ requestId, terminalHandle, paneKey }) => {
          const expected = registry.getPendingBinding(requestId)
          if (
            !expected ||
            expected.terminalHandle !== terminalHandle ||
            expected.paneKey !== paneKey
          ) {
            return
          }
          const observation = await observeBinding(runtime, expected)
          if (observation.status === 'stale') {
            registry.invalidate(requestId)
          }
        })
      )
      return registry.pending()
    }
  }),
  defineMethod({
    name: 'terminalInteraction.respond',
    params: InteractionRespond,
    handler: async (params, { runtime }) => {
      const registry = getTerminalInteractionRegistry(runtime)
      const expected = registry.getPendingBinding(params.requestId)
      let binding: TerminalInteractionBinding | undefined
      if (expected) {
        const observation = await observeBinding(runtime, expected)
        if (observation.status === 'stale') {
          registry.invalidate(params.requestId)
          throw new Error('terminal_interaction_caller_stale')
        }
        if (observation.status === 'unavailable') {
          throw new Error('terminal_interaction_terminal_unavailable')
        }
        binding = observation.binding
      }
      return registry.respond(params.requestId, params.result, binding)
    }
  })
]
