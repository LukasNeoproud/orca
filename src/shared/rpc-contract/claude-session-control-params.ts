import { z } from 'zod'
import {
  CLAUDE_PERMISSION_RULE_FILES,
  MAX_CLAUDE_SIDE_QUESTION_LENGTH
} from '../claude-session-control'
import { SessionId } from './structured-agent-session-identifiers'

const ServerName = z.string().min(1).max(512)

export const ClaudeSessionControlRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mcp-status') }).strict(),
  z.object({ kind: z.literal('agents') }).strict(),
  z.object({ kind: z.literal('usage') }).strict(),
  z.object({ kind: z.literal('mcp-reconnect'), server: ServerName }).strict(),
  z.object({ kind: z.literal('mcp-toggle'), server: ServerName, enabled: z.boolean() }).strict(),
  z.object({ kind: z.literal('mcp-authenticate'), server: ServerName }).strict(),
  z.object({ kind: z.literal('mcp-clear-auth'), server: ServerName }).strict(),
  z.object({ kind: z.literal('permission-rules') }).strict(),
  z
    .object({
      kind: z.literal('permission-rule-edit'),
      action: z.enum(['add', 'remove']),
      file: z.enum(CLAUDE_PERMISSION_RULE_FILES),
      behavior: z.enum(['allow', 'deny', 'ask']),
      rule: z.string().trim().min(1).max(2000)
    })
    .strict(),
  z
    .object({
      kind: z.literal('side-question'),
      question: z.string().min(1).max(MAX_CLAUDE_SIDE_QUESTION_LENGTH)
    })
    .strict(),
  z.object({ kind: z.literal('background-tool'), toolUseId: z.string().min(1).max(256) }).strict()
])

export const ClaudeSessionControlParams = z
  .object({ sessionId: SessionId, request: ClaudeSessionControlRequestSchema })
  .strict()
