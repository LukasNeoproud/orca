import type { Session } from './session'

const createdAtBySession = new WeakMap<Session, number>()

export function recordTerminalHostSessionCreatedAt(session: Session): void {
  createdAtBySession.set(session, Date.now())
}

export function terminalHostSessionCreatedAt(session: Session): number {
  return createdAtBySession.get(session) ?? 0
}
