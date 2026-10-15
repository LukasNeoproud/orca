// The messages between the renderer and a plugin's surface-module worker. The worker runs
// untrusted code, so everything it sends is read as data here and checked before use.

import type { ClaudeModsClientFile, ClaudeModsClientLimits } from './claude-mods-client-bundle'

export type ClaudeModsClientActKind = 'key' | 'pointer' | 'tick' | 'held'

export type ClaudeModsClientCall =
  | {
      op: 'load'
      plugin: string
      files: ClaudeModsClientFile[]
      runtime: string
      limits: ClaudeModsClientLimits
    }
  | { op: 'mount'; id: string; entry: string; component: string; props: unknown }
  | { op: 'resize'; id: string; columns: number; rows: number }
  | { op: 'setProps'; id: string; props: unknown }
  | { op: 'render'; id: string }
  | { op: 'act'; id: string; kind: ClaudeModsClientActKind; payload: unknown }
  | { op: 'unmount'; id: string }

/** Sent without an answer: housekeeping that runs none of the plugin's code. */
export type ClaudeModsClientNote = { op: 'dropHeld'; id: string; handles: number[] }

export type ClaudeModsClientListeners = { key: boolean; pointer: boolean }

export type ClaudeModsClientAnswer =
  | { seq: number; ok: true; value?: string; listeners?: ClaudeModsClientListeners }
  | { seq: number; ok: false; reason: string }

/** What the runtime's `host` raised inside the worker, for one instance. */
export type ClaudeModsClientSignal =
  | { type: 'schedule'; id: string }
  | { type: 'post'; id: string; text: string }
  | { type: 'tick'; id: string; handle: number }
  | { type: 'fault'; id: string; reason: string }

export type ClaudeModsClientWorkerMessage =
  | ({ type: 'answer' } & ClaudeModsClientAnswer)
  /** The worker started running call `seq`; its budget counts from here. */
  | { type: 'begin'; seq: number }
  | ClaudeModsClientSignal

/** A reason is the module's own text: one thrown at any size is cut before anything holds it. */
const MAX_REASON_CHARS = 1000

function readReason(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_REASON_CHARS) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readListeners(value: unknown): ClaudeModsClientListeners | undefined {
  return isRecord(value) ? { key: value.key === true, pointer: value.pointer === true } : undefined
}

/** One message from the worker, or null for anything not shaped like one. */
export function readClaudeModsClientWorkerMessage(
  value: unknown
): ClaudeModsClientWorkerMessage | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.type === 'begin') {
    return typeof value.seq === 'number' ? { type: 'begin', seq: value.seq } : null
  }
  if (value.type === 'answer') {
    if (typeof value.seq !== 'number') {
      return null
    }
    if (value.ok === true) {
      const listeners = readListeners(value.listeners)
      return {
        type: 'answer',
        seq: value.seq,
        ok: true,
        ...(typeof value.value === 'string' ? { value: value.value } : {}),
        ...(listeners ? { listeners } : {})
      }
    }
    return {
      type: 'answer',
      seq: value.seq,
      ok: false,
      reason: readReason(value.reason)
    }
  }
  if (typeof value.id !== 'string') {
    return null
  }
  switch (value.type) {
    case 'schedule':
      return { type: 'schedule', id: value.id }
    case 'post':
      return typeof value.text === 'string'
        ? { type: 'post', id: value.id, text: value.text }
        : null
    case 'tick':
      return typeof value.handle === 'number'
        ? { type: 'tick', id: value.id, handle: value.handle }
        : null
    case 'fault':
      return {
        type: 'fault',
        id: value.id,
        reason: readReason(value.reason)
      }
    default:
      return null
  }
}
