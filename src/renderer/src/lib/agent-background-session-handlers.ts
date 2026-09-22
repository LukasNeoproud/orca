import type { ParsedAgentStatusPayload } from '../../../shared/agent-status-types'
import type { AgentStatusObservation } from '../../../shared/agent-status-observation'
import { createBackgroundAgentStatusConsumer } from '@/lib/background-agent-status-consumer'
import { settleTabPtyBinding } from '@/lib/agent-background-session-exit'
import type { AgentStatusConnectionRouting } from './agent-status-connection-ownership'

export function createAgentBackgroundExitHandler(args: {
  getTab: () => { id: string } | null
  unsubscribeExit: () => void
  unsubscribeData: () => void
  clearStartupDelivery: () => void
  clearLaunchConfig: () => void
  onExit?: (ptyId: string, code: number) => void
}): { handleExit: (ptyId: string, code: number) => void; preventExit: () => void } {
  let handled = false
  return {
    handleExit: (ptyId, code) => {
      if (handled) {
        return
      }
      handled = true
      args.unsubscribeExit()
      args.unsubscribeData()
      args.clearStartupDelivery()
      const tab = args.getTab()
      if (tab) {
        settleTabPtyBinding(tab.id, ptyId, code)
      }
      args.clearLaunchConfig()
      args.onExit?.(ptyId, code)
    },
    preventExit: () => {
      handled = true
    }
  }
}

export function createAgentBackgroundDataHandler(args: {
  paneKey: string
  launchToken: string
  mainOwnsAgentStatusWrites: boolean
  expectedConnectionId: string | null | undefined
  runtimeEnvironmentId: string | null
  getPtyId: () => string
  onAgentStatus?: (payload: ParsedAgentStatusPayload) => void
  onData?: (chunk: string) => void
  handleStartupData: (chunk: string) => string
  scheduleStartup: () => void
}): {
  handleData: (data: string) => void
  resolveRouting: () => AgentStatusConnectionRouting | undefined
  observeLaunchIngress: () => AgentStatusObservation
} {
  const statusConsumer = createBackgroundAgentStatusConsumer({
    paneKey: args.paneKey,
    launchToken: args.launchToken,
    mainOwnsAgentStatusWrites: args.mainOwnsAgentStatusWrites,
    expectedConnectionId: args.expectedConnectionId,
    runtimeEnvironmentId: args.runtimeEnvironmentId,
    getPtyId: args.getPtyId,
    onAgentStatus: args.onAgentStatus
  })
  return {
    handleData: (data) => {
      data = args.handleStartupData(data)
      args.onData?.(data)
      args.scheduleStartup()
      statusConsumer.consume(data)
    },
    resolveRouting: () => statusConsumer.resolveRouting(),
    observeLaunchIngress: () => statusConsumer.observeLaunchIngress()
  }
}
