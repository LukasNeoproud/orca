import { z } from 'zod'
import { isAgentSessionId } from '../../../../shared/agent-session-record'

const SessionId = z.string().max(512).refine(isAgentSessionId, 'Invalid agent session id')
const identifier = (message: string, maxLength = 512) =>
  z
    .string()
    .min(1, message)
    .max(maxLength, message)
    .refine((value) => value === value.trim(), message)

const TopicAnchor = z
  .object({
    epoch: identifier('Invalid topic epoch'),
    itemId: identifier('Invalid topic item id', 4096),
    sequence: z.number().int().nonnegative()
  })
  .strict()

const TopicChapter = z
  .object({
    id: identifier('Invalid topic chapter id'),
    title: z.string().min(1).max(120),
    start: TopicAnchor,
    end: TopicAnchor,
    titleSource: z.enum(['automatic', 'manual']),
    boundaryAfterManual: z.boolean()
  })
  .strict()

const TopicIndex = z
  .object({
    sessionId: SessionId,
    revision: z.number().int().nonnegative(),
    automatic: z.boolean(),
    chapters: z.array(TopicChapter).max(2000)
  })
  .strict()

export const TopicIndexWriteParams = z
  .object({
    sessionId: SessionId,
    expectedRevision: z.number().int().nonnegative(),
    index: TopicIndex
  })
  .strict()
