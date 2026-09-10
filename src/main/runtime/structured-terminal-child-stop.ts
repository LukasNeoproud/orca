import type { AgentSessionProcessIdentity } from '../../shared/agent-session-record'
import type { AgentSessionOwnerProbe } from '../../shared/agent-session-lease-adjudication'
import { isProvenDeadProbe } from '../../shared/agent-session-lease-adjudication'
import { probeAgentSessionProcessIdentity } from './agent-session-process-identity-probe'

type ChildStopDeps = {
  probe?: (identity: AgentSessionProcessIdentity) => Promise<AgentSessionOwnerProbe>
  signal?: (pid: number, signal: 'SIGTERM' | 'SIGKILL') => void
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export const structuredTerminalChildExited = isProvenDeadProbe

export async function waitForStructuredTerminalChildExit(
  identity: AgentSessionProcessIdentity,
  timeoutMs = 5_000,
  deps: ChildStopDeps = {}
): Promise<void> {
  const probe = deps.probe ?? ((identity) => probeAgentSessionProcessIdentity({ identity }))
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const deadline = now() + timeoutMs
  do {
    if (structuredTerminalChildExited(await probe(identity))) {
      return
    }
    await sleep(100)
  } while (now() < deadline)
  throw new Error('The agent child process could not be proven stopped.')
}

/** Stop the proved agent child while leaving its original shell and pane alive. */
export async function stopStructuredTerminalChild(
  identity: AgentSessionProcessIdentity,
  deps: ChildStopDeps = {}
): Promise<void> {
  const probe = deps.probe ?? ((identity) => probeAgentSessionProcessIdentity({ identity }))
  const signal =
    deps.signal ??
    ((pid, signal) => {
      process.kill(pid, signal)
    })
  for (const [kind, timeout] of [
    ['SIGTERM', 15_000],
    ['SIGKILL', 5_000]
  ] as const) {
    const proof = await probe(identity)
    if (structuredTerminalChildExited(proof)) {
      return
    }
    if (proof.outcome !== 'identity-matched' || proof.matchedOn.length === 0) {
      throw new Error('The agent child process could not be stopped safely.')
    }
    try {
      signal(identity.pid, kind)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error
      }
    }
    try {
      await waitForStructuredTerminalChildExit(identity, timeout, deps)
      return
    } catch (error) {
      if (kind === 'SIGKILL') {
        throw error
      }
    }
  }
}
