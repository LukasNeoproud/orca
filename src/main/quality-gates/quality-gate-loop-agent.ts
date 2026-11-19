// What the feedback loop knows of an agent: who finished a step, what it did next, and whether a
// message reached it. Its status itself stays in the hook server's store.

/** The agent whose step ended, as the hook server's row named it. */
export type QualityGateLoopAgent = {
  paneKey: string
  agentType: string | undefined
  /** A structured chat is addressed by its session; anything else by its terminal. */
  structuredSessionId?: string
  terminalHandle?: string
  /** When the finished turn began; typed input after it means the user is at the terminal. */
  turnStartedAt?: number
  completedAt: number
}

export type QualityGateLoopAgentEvent =
  | { type: 'step-completed'; worktreeId: string; agent: QualityGateLoopAgent }
  /** A turn began. `prompt` is the hook's one-line preview, empty when the hook carries none. */
  | {
      type: 'turn-started'
      worktreeId: string
      paneKey: string
      prompt: string
    }
  | { type: 'interrupted'; worktreeId: string; paneKey: string }
  | { type: 'agent-gone'; paneKey: string }

export type QualityGateFeedbackDelivery =
  | { kind: 'sent' }
  | { kind: 'not-deliverable'; reason: 'not-deliverable' | 'user-input'; detail: string }
