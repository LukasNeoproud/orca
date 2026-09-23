type JsonRecord = Record<string, unknown>

export function contextTools(): JsonRecord[] {
  return [
    tool(
      'request_compact',
      'Queue compaction after a completed topic, then end the current turn. Orca applies it afterward; do not poll in this turn.',
      transitionSchema()
    ),
    tool(
      'request_fresh_context',
      'Queue a new linked context after an independent stage, then end the current turn. Orca applies it afterward; do not poll in this turn.',
      transitionSchema()
    ),
    tool(
      'context_request_status',
      'Read one queued context-transition request.',
      requestIdSchema()
    ),
    tool(
      'cancel_context_request',
      'Cancel one queued context-transition request when cancellation is still allowed.',
      requestIdSchema()
    ),
    tool(
      'context_transition_state',
      'Read context-transition capability and current state for this Orca-owned session.',
      { type: 'object', additionalProperties: false }
    )
  ]
}

function tool(name: string, description: string, inputSchema: JsonRecord): JsonRecord {
  return { name, description, inputSchema }
}

function transitionSchema(): JsonRecord {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['checkpoint', 'reason', 'continuation'],
    properties: {
      checkpoint: checkpointSchema(),
      reason: { type: 'string', minLength: 1, maxLength: 1024 },
      continuation: { type: 'string', enum: ['wait-for-user', 'continue'] },
      requestId: { type: 'string', maxLength: 256 }
    }
  }
}

function checkpointSchema(): JsonRecord {
  const text = { type: 'string', minLength: 1, maxLength: 4096 }
  const items = {
    type: 'array',
    maxItems: 32,
    items: { type: 'string', minLength: 1, maxLength: 1024 }
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'goal',
      'completed',
      'decisions',
      'constraints',
      'changes',
      'verification',
      'openQuestions'
    ],
    properties: {
      goal: text,
      completed: text,
      decisions: items,
      constraints: items,
      changes: items,
      verification: items,
      openQuestions: items,
      nextStep: text
    }
  }
}

function requestIdSchema(): JsonRecord {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['requestId'],
    properties: { requestId: { type: 'string', minLength: 1, maxLength: 256 } }
  }
}
