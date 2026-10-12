import { describe, expect, it, vi } from 'vitest'
import {
  encodeOrcaInteractionResult,
  type OrcaInteractionRequest
} from '../../shared/orca-interaction'
import {
  CODEX_MCP_ELICITATION_METHOD,
  decodeOrcaInteractionElicitationResponse,
  encodeOrcaInteractionElicitationMessage,
  ORCA_INTERACTION_MCP_SERVER,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
} from '../../shared/orca-interaction-elicitation'
import {
  answerCodexPrompt,
  CodexPromptRegistry,
  prepareCodexPromptAnswer
} from './codex-structured-prompt-replies'
import { disposeCodexServerRequest } from './codex-server-request-disposition'

function answerByItem(
  registry: CodexPromptRegistry,
  connection: Parameters<typeof answerCodexPrompt>[1],
  itemId: string,
  optionId: string
): void {
  const claim = registry.claim(itemId) ?? registry.claimBound(itemId)
  if (!claim) {
    throw new Error(`codex app-server is no longer waiting on ${itemId}`)
  }
  try {
    const prepared = prepareCodexPromptAnswer(claim.prompt, { kind: 'option', optionId })
    answerCodexPrompt(registry, connection, claim, prepared)
  } catch (error) {
    registry.releaseClaim(claim)
    throw error
  }
}

const form: OrcaInteractionRequest = {
  title: 'Storage',
  fields: [
    {
      id: 'storage',
      type: 'single_choice',
      label: 'Storage',
      required: true,
      allowCustom: true,
      options: [{ id: 'room', label: 'Room', recommended: true }]
    }
  ]
}
const params = {
  threadId: 'legacy-thread',
  turnId: 'turn-2',
  serverName: ORCA_INTERACTION_MCP_SERVER,
  mode: 'form',
  message: encodeOrcaInteractionElicitationMessage(form),
  requestedSchema: ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
}

describe('Codex resumed interaction elicitation', () => {
  it.each([
    { status: 'submitted' as const, values: { storage: 'room' } },
    {
      status: 'submitted' as const,
      values: { storage: { type: 'custom' as const, value: 'Files' } }
    },
    { status: 'cancelled' as const }
  ])('waits for and returns a validated $status result exactly once', (result) => {
    const registry = new CodexPromptRegistry()
    const connection = { respond: vi.fn(), respondWithError: vi.fn() }
    const disposition = disposeCodexServerRequest(registry, connection, {
      id: 4,
      method: CODEX_MCP_ELICITATION_METHOD,
      params
    })
    expect(disposition).toMatchObject({
      kind: 'prompt',
      prompt: {
        threadId: 'legacy-thread',
        interactionRequest: form,
        promptKey: 'mcp-elicitation:4'
      }
    })
    expect(connection.respond).not.toHaveBeenCalled()
    registry.bindJournalItemId('journal-form', 'legacy-thread', 'mcp-elicitation:4')
    answerByItem(registry, connection, 'journal-form', encodeOrcaInteractionResult(result))
    expect(connection.respond).toHaveBeenCalledOnce()
    expect(connection.respond.mock.calls[0][0]).toBe(4)
    expect(
      decodeOrcaInteractionElicitationResponse(form, connection.respond.mock.calls[0][1])
    ).toEqual(result)
    expect(() =>
      answerByItem(registry, connection, 'journal-form', encodeOrcaInteractionResult(result))
    ).toThrow('no longer waiting')
  })

  it('keeps invalid input pending and correlates concurrent forms separately', () => {
    const registry = new CodexPromptRegistry()
    const connection = { respond: vi.fn() }
    for (const id of [4, 5]) {
      registry.register({ id, method: CODEX_MCP_ELICITATION_METHOD, params })
    }
    expect(() =>
      answerByItem(
        registry,
        connection,
        'mcp-elicitation:4',
        encodeOrcaInteractionResult({ status: 'submitted', values: {} })
      )
    ).toThrow('not a valid')
    expect(connection.respond).not.toHaveBeenCalled()
    answerByItem(
      registry,
      connection,
      'mcp-elicitation:5',
      encodeOrcaInteractionResult({ status: 'cancelled' })
    )
    expect(registry.find('mcp-elicitation:4')).not.toBeNull()
    expect(registry.find('mcp-elicitation:5')).toBeNull()
  })

  it.each([
    { serverName: 'another-server' },
    { mode: 'url' },
    { message: 'unstructured request' },
    { message: 'orca-interaction-v1:{"fields":[]}' },
    { threadId: '' }
  ])('declines unrelated or malformed elicitation: %j', (override) => {
    const connection = { respond: vi.fn(), respondWithError: vi.fn() }
    expect(
      disposeCodexServerRequest(new CodexPromptRegistry(), connection, {
        id: 9,
        method: CODEX_MCP_ELICITATION_METHOD,
        params: { ...params, ...override }
      })
    ).toMatchObject({ kind: 'responded' })
    expect(connection.respond).toHaveBeenCalledWith(9, {
      action: 'decline',
      content: null,
      _meta: null
    })
  })
})
