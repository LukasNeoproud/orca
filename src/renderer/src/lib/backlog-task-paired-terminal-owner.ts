import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'
import { recognizeAgentProcess } from '../../../shared/agent-process-recognition'
import { isRemoteForegroundEvidence } from '../../../shared/foreground-process-evidence'
import type {
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionTabsResult,
  RuntimeTerminalListResult,
  RuntimeTerminalSummary
} from '../../../shared/runtime-types'
import type { AiVaultAgent } from '../../../shared/ai-vault-types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

const TERMINAL_CENSUS_LIMIT = 512
const PROCESS_EVIDENCE_MAX_AGE_MS = 10_000
const PROCESS_PROBE_LIMIT = 32

type SessionTabsInventory = {
  snapshots: RuntimeMobileSessionTabsResult[]
  authoritative?: true
}

type TerminalTab = Extract<RuntimeMobileSessionClientTab, { type: 'terminal' }>

export type PairedProviderOwnerVerdict = 'live' | 'exited' | 'unverifiable'
export type PairedProviderAssociation = Pick<
  BacklogTaskAssociation,
  'executionHostId' | 'session' | 'terminal'
>

function terminalTabs(inventory: SessionTabsInventory): TerminalTab[] {
  return inventory.snapshots.flatMap((snapshot) =>
    snapshot.tabs.filter((tab): tab is TerminalTab => tab.type === 'terminal')
  )
}

async function runningAgent(
  environmentId: string,
  terminal: RuntimeTerminalSummary,
  expectedAgent: AiVaultAgent
): Promise<'matching' | 'other' | 'unverifiable'> {
  if (!terminal.incarnationId) {
    return 'unverifiable'
  }
  try {
    const { process } = await callRuntimeRpc<{
      process: { foregroundProcess?: string | null; foregroundProcessEvidence?: unknown }
    }>(
      { kind: 'environment', environmentId },
      'terminal.inspectProcess',
      {
        terminal: terminal.handle,
        expectedIncarnationId: terminal.incarnationId
      },
      { timeoutMs: 15_000 }
    )
    const evidence = process.foregroundProcessEvidence
    if (
      !isRemoteForegroundEvidence(evidence) ||
      evidence.capturedAgeMs > PROCESS_EVIDENCE_MAX_AGE_MS ||
      evidence.verdict === 'unverifiable'
    ) {
      return 'unverifiable'
    }
    if (evidence.verdict === 'exited') {
      return 'other'
    }
    const recognized = recognizeAgentProcess(evidence.processName)
    if (recognized) {
      return recognized.agent === expectedAgent ? 'matching' : 'other'
    }
    return evidence.processName === null && !process.foregroundProcess ? 'other' : 'unverifiable'
  } catch {
    return 'unverifiable'
  }
}

/** Uses only the paired owner runtime's fresh PTY and authoritative session inventories. */
export async function classifyPairedProviderOwner(args: {
  environmentId: string
  association: PairedProviderAssociation
  agent: AiVaultAgent
}): Promise<PairedProviderOwnerVerdict> {
  if (args.association.executionHostId !== 'local' || !args.association.session.providerSession) {
    return 'unverifiable'
  }
  const target = { kind: 'environment' as const, environmentId: args.environmentId }
  try {
    const inventory = await callRuntimeRpc<SessionTabsInventory>(
      target,
      'session.tabs.listAll',
      {},
      { timeoutMs: 15_000 }
    )
    if (inventory.authoritative !== true) {
      return 'unverifiable'
    }
    const terminals = await callRuntimeRpc<RuntimeTerminalListResult>(
      target,
      'terminal.list',
      {
        limit: TERMINAL_CENSUS_LIMIT,
        requireFreshPtyLiveness: true,
        includeVisualLayouts: false
      },
      { timeoutMs: 15_000 }
    )
    if (
      terminals.truncated ||
      !terminals.hostScope?.hostIds.includes(args.association.executionHostId) ||
      terminals.hostScope.omittedHostIds.includes(args.association.executionHostId)
    ) {
      return 'unverifiable'
    }
    const liveByHandle = new Map(terminals.terminals.map((terminal) => [terminal.handle, terminal]))
    const providerId = args.association.session.providerSession.id
    const probeByHandle = new Map<
      string,
      {
        terminal: RuntimeTerminalSummary
        providerId?: string
      }
    >()
    for (const tab of terminalTabs(inventory)) {
      const tabProviderId = tab.agentStatus?.providerSession?.id
      const hintedAgent = tab.agentStatus?.agentType ?? tab.launchAgent
      if (tab.status === 'pending-handle') {
        if (tabProviderId === providerId) {
          return 'live'
        }
        if (!tabProviderId && (hintedAgent === args.agent || hintedAgent === undefined)) {
          return 'unverifiable'
        }
        continue
      }
      const terminal = liveByHandle.get(tab.terminal)
      if (!terminal) {
        continue
      }
      probeByHandle.set(terminal.handle, {
        terminal,
        providerId: tabProviderId
      })
    }
    for (const terminal of terminals.terminals) {
      if (!probeByHandle.has(terminal.handle)) {
        probeByHandle.set(terminal.handle, {
          terminal
        })
      }
    }
    const probes = [...probeByHandle.values()]
    if (probes.length > PROCESS_PROBE_LIMIT) {
      return 'unverifiable'
    }
    const running = await Promise.all(
      probes.map((probe) => runningAgent(args.environmentId, probe.terminal, args.agent))
    )
    for (let index = 0; index < probes.length; index += 1) {
      const probe = probes[index]!
      const process = running[index]!
      if (process === 'unverifiable') {
        return 'unverifiable'
      }
      if (process !== 'matching') {
        continue
      }
      if (probe.providerId === providerId) {
        return 'live'
      }
      if (!probe.providerId) {
        return 'unverifiable'
      }
    }
    return 'exited'
  } catch {
    return 'unverifiable'
  }
}
