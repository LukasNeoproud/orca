import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendNotesToActiveAgentSession } from './active-agent-note-send'
import {
  createNoteSendAppState,
  OTHER_LEAF_ID,
  PASTE_BEGIN,
  PASTE_END,
  type NoteSendAppState
} from './active-agent-note-send-test-harness'

const testState = vi.hoisted(() => ({
  appState: null as unknown as NoteSendAppState,
  callRuntimeRpc: vi.fn(),
  getActiveRuntimeTarget: vi.fn(() => ({ kind: 'local' })),
  RuntimeRpcCallError: class RuntimeRpcCallError extends Error {
    readonly code: string
    readonly response: unknown

    constructor(response: { error: { code: string; message: string } }) {
      super(response.error.message)
      this.name = 'RuntimeRpcCallError'
      this.code = response.error.code
      this.response = response
    }
  }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: NoteSendAppState) => unknown) => selector(testState.appState),
    {
      getState: () => testState.appState
    }
  )
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: testState.callRuntimeRpc,
  getActiveRuntimeTarget: testState.getActiveRuntimeTarget,
  RuntimeRpcCallError: testState.RuntimeRpcCallError
}))

describe('active agent note send', () => {
  beforeEach(() => {
    testState.appState = createNoteSendAppState()
    testState.callRuntimeRpc.mockReset()
    testState.getActiveRuntimeTarget.mockClear()
    testState.getActiveRuntimeTarget.mockReturnValue({ kind: 'local' })
  })

  it.each(['ssh:expected', 'ssh:other', undefined])(
    'preserves handoff whitespace only on the required execution host (%s)',
    async (executionHostId) => {
      testState.callRuntimeRpc.mockImplementation(async (_target, method) => {
        if (method === 'terminal.list') {
          return {
            terminals: [
              { handle: 'term-2', tabId: 'tab-9', leafId: OTHER_LEAF_ID, executionHostId }
            ]
          }
        }
        if (method === 'terminal.agentStatus') {
          return { agentStatus: { handle: 'term-2', isRunningAgent: true, status: 'working' } }
        }
        if (method === 'terminal.send') {
          return { send: { accepted: true } }
        }
        throw new Error(`unexpected method ${method}`)
      })
      const result = await sendNotesToActiveAgentSession({
        worktreeId: 'wt-1',
        prompt: '    code\n\n',
        preserveWhitespace: true,
        expectedExecutionHostId: 'ssh:expected',
        noteTarget: { tabId: 'tab-9', leafId: OTHER_LEAF_ID }
      })
      const writes = testState.callRuntimeRpc.mock.calls.filter(
        ([, method]) => method === 'terminal.send'
      )
      if (executionHostId === 'ssh:expected') {
        expect(result.status).toBe('sent')
        expect(writes[0][2].text).toBe(`${PASTE_BEGIN}    code\n\n${PASTE_END}`)
      } else {
        expect(result.status).toBe('status-unavailable')
        expect(writes).toHaveLength(0)
      }
    }
  )
})
