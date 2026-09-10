import type {
  AgentSessionModelOption,
  AgentSessionOptionChoice,
  AgentSessionOptionsResult
} from '../../shared/agent-session-wire'
import type { CodexAppServerConnection } from './codex-app-server-connection'
import type { CodexOpenedThread } from './codex-structured-thread-open'
import type { CodexSession } from './codex-structured-session-state'
import { isCodexTurnOptionKey } from './codex-structured-turn-start'
import { AgentSessionOptionRejectedError } from '../native-chat/agent-session-wire/structured-agent-session-option-error'
import { readCodexPermissionChoices } from './codex-structured-permissions'
import { codexFastModeOption, readCodexModelServiceTiers } from './codex-structured-service-tier'

const MODEL_PAGE_LIMIT = 100
const MAX_MODEL_PAGES = 20

export function restoredCodexSessionOptions(
  options: Readonly<Record<string, string>> | undefined
): Map<string, string> {
  return new Map(Object.entries(options ?? {}).filter(([key]) => isCodexTurnOptionKey(key)))
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function effortLabel(value: string): string {
  return value === 'xhigh'
    ? 'Extra high'
    : value === 'minimal'
      ? 'Minimal'
      : `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function effortChoice(value: unknown): AgentSessionOptionChoice | null {
  const row = record(value)
  const effort = text(row?.reasoningEffort)
  if (!effort) {
    return null
  }
  const description = text(row?.description)
  return {
    value: effort,
    label: effortLabel(effort),
    ...(description ? { description } : {})
  }
}

type CodexModelOption = AgentSessionModelOption & {
  serviceTiers?: string[]
  defaultServiceTier?: string | null
}

function modelOption(value: unknown): CodexModelOption | null {
  const row = record(value)
  if (!row) {
    return null
  }
  const id = text(row.model) ?? text(row.id)
  const label = text(row.displayName) ?? id
  if (!id || !label || row.hidden === true) {
    return null
  }
  const description = text(row.description)
  const defaultEffort = text(row.defaultReasoningEffort)
  const serviceTiers = readCodexModelServiceTiers(row)
  const efforts = Array.isArray(row.supportedReasoningEfforts)
    ? row.supportedReasoningEfforts
        .map(effortChoice)
        .filter((choice): choice is AgentSessionOptionChoice => choice !== null)
    : []
  return {
    id,
    label,
    ...(description ? { description } : {}),
    isDefault: row.isDefault === true,
    ...(defaultEffort ? { defaultEffort } : {}),
    ...(serviceTiers ? { serviceTiers } : {}),
    ...(row.defaultServiceTier === null || typeof row.defaultServiceTier === 'string'
      ? { defaultServiceTier: row.defaultServiceTier }
      : {}),
    efforts
  }
}

export async function readCodexStructuredSessionOptions(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  current: { model?: string; effort?: string; serviceTier?: string | null }
  timeoutMs?: number
}): Promise<Omit<AgentSessionOptionsResult, 'models'> & { models: CodexModelOption[] }> {
  const models: CodexModelOption[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const response = record(
      await input.connection.request(
        'model/list',
        { limit: MODEL_PAGE_LIMIT, includeHidden: false, ...(cursor ? { cursor } : {}) },
        { timeoutMs: input.timeoutMs }
      )
    )
    const rows = Array.isArray(response?.data) ? response.data : []
    for (const row of rows) {
      const parsed = modelOption(row)
      if (parsed && !models.some((model) => model.id === parsed.id)) {
        models.push(parsed)
      }
    }
    cursor = text(response?.nextCursor)
    if (!cursor) {
      break
    }
  }
  if (input.current.model && !models.some((model) => model.id === input.current.model)) {
    models.push({
      id: input.current.model,
      label: input.current.model,
      isDefault: false,
      efforts: []
    })
  }
  const model = input.current.model ?? models.find((entry) => entry.isDefault)?.id ?? models[0]?.id
  if (!model) {
    throw new Error('codex app-server returned no available models')
  }
  const currentModel = models.find((entry) => entry.id === model)
  const fastMode = codexFastModeOption(
    currentModel?.serviceTiers,
    input.current.serviceTier,
    currentModel?.defaultServiceTier
  )
  return {
    models,
    ...(fastMode ? { options: [fastMode] } : {}),
    current: { model, ...(input.current.effort ? { effort: input.current.effort } : {}) }
  }
}

export function reportedCodexThreadOptions(
  opened: CodexOpenedThread
): CodexSession['reportedOptions'] {
  return {
    ...(opened.model ? { model: opened.model } : {}),
    ...(opened.effort ? { effort: opened.effort } : {}),
    ...(opened.serviceTier !== undefined ? { serviceTier: opened.serviceTier } : {}),
    ...(opened.permissions ? { permissions: opened.permissions } : {})
  }
}

export async function readLiveCodexSessionOptions(
  session: CodexSession,
  timeoutMs: number | undefined
): Promise<AgentSessionOptionsResult> {
  const model = session.options.get('model') ?? session.reportedOptions.model
  const effort = session.options.get('effort') ?? session.reportedOptions.effort
  const serviceTier = session.options.get('serviceTier') ?? session.reportedOptions.serviceTier
  const [result, permissionChoices] = await Promise.all([
    readCodexStructuredSessionOptions({
      connection: session.connection,
      current: { model, effort, serviceTier },
      timeoutMs
    }),
    session.cwd ? readCodexPermissionChoices(session.connection, timeoutMs) : Promise.resolve([])
  ])
  const permissions = session.options.get('permissions') ?? session.reportedOptions.permissions
  session.supportsDefaultServiceTier = result.models.some(
    (entry) => entry.defaultServiceTier !== undefined
  )
  return {
    ...result,
    models: result.models.map(
      ({ serviceTiers: _tiers, defaultServiceTier: _default, ...entry }) => entry
    ),
    options: [
      ...(result.options ?? []),
      ...(permissionChoices.length
        ? [
            {
              id: 'permissions',
              label: 'Permissions',
              category: 'mode' as const,
              choices: permissionChoices,
              ...(permissions ? { currentValue: permissions } : {})
            }
          ]
        : [])
    ]
  }
}

export async function applyCodexStructuredSessionOption(
  session: CodexSession,
  key: string,
  value: string,
  timeoutMs: number | undefined
): Promise<Readonly<Record<string, string>>> {
  try {
    return await applyValidatedCodexStructuredSessionOption(session, key, value, timeoutMs)
  } catch (error) {
    throw new AgentSessionOptionRejectedError(error)
  }
}

async function applyValidatedCodexStructuredSessionOption(
  session: CodexSession,
  key: string,
  value: string,
  timeoutMs: number | undefined
): Promise<Readonly<Record<string, string>>> {
  if (key === 'serviceTier') {
    const catalog = await readCodexStructuredSessionOptions({
      connection: session.connection,
      current: { model: session.options.get('model') ?? session.reportedOptions.model },
      timeoutMs
    })
    const tiers = catalog.models.find((entry) => entry.id === catalog.current.model)?.serviceTiers
    const tier = value === 'fast' ? 'priority' : value
    if (!tiers || (tier !== 'default' && !tiers.includes(tier))) {
      throw new Error(`Codex does not offer serviceTier = ${value} for this session`)
    }
    session.supportsDefaultServiceTier = catalog.models.some(
      (entry) => entry.defaultServiceTier !== undefined
    )
    session.options.set(key, tier)
    return Object.fromEntries(session.options)
  }
  if (key === 'permissions') {
    const options = await readLiveCodexSessionOptions(session, timeoutMs)
    const option = options.options?.find((entry) => entry.id === key)
    if (!option?.choices.some((choice) => choice.value === value)) {
      throw new Error(`Codex does not offer ${key} = ${value} for this session`)
    }
    session.options.delete('approvalPolicy')
    session.options.delete('approvalsReviewer')
    session.options.set(key, value)
    return Object.fromEntries(session.options)
  }
  if (key !== 'model' && key !== 'effort') {
    if (key === 'approvalPolicy' || key === 'approvalsReviewer') {
      session.options.delete('permissions')
      delete session.reportedOptions.permissions
    }
    session.options.set(key, value)
    return Object.fromEntries(session.options)
  }
  const priorModel = session.options.get('model') ?? session.reportedOptions.model
  const priorEffort = session.options.get('effort') ?? session.reportedOptions.effort
  const catalog = await readCodexStructuredSessionOptions({
    connection: session.connection,
    current: {
      ...(priorModel ? { model: priorModel } : {}),
      ...(priorEffort ? { effort: priorEffort } : {})
    },
    timeoutMs
  })
  if (key === 'model' && !catalog.models.some((entry) => entry.id === value)) {
    throw new Error(`codex app-server does not offer model ${value}`)
  }
  const modelId = key === 'model' ? value : catalog.current.model
  const model = catalog.models.find((entry) => entry.id === modelId)
  const requestedEffort = key === 'effort' ? value : priorEffort
  if (
    key === 'effort' &&
    (!model?.efforts.length || !model.efforts.some((effort) => effort.value === requestedEffort))
  ) {
    throw new Error(`codex app-server model ${modelId} does not support ${value}`)
  }
  const effort =
    model?.efforts.length === 0
      ? undefined
      : (model?.efforts.find((entry) => entry.value === requestedEffort)?.value ??
        model?.defaultEffort ??
        model?.efforts[0]?.value)
  session.options.set('model', modelId)
  if (
    key === 'model' &&
    model?.serviceTiers &&
    !model.serviceTiers.includes('priority') &&
    ['priority', 'fast'].includes(
      session.options.get('serviceTier') ?? session.reportedOptions.serviceTier ?? ''
    )
  ) {
    session.options.set('serviceTier', 'default')
  }
  if (effort) {
    session.options.set('effort', effort)
  } else {
    session.options.delete('effort')
  }
  return Object.fromEntries(session.options)
}
