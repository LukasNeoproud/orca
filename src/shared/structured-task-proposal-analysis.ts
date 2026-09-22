import {
  STRUCTURED_TASK_PROPOSAL_LIMITS,
  stableStructuredTaskProposalId,
  structuredTaskProposalBranchId,
  type StructuredTaskProposal,
  type StructuredTaskProposalCandidate,
  type StructuredTaskProposalItem,
  type StructuredTaskProposalSource
} from './structured-task-proposal'

const LAYER_WORDS = new Set([
  'api',
  'backend',
  'client',
  'component',
  'database',
  'docs',
  'endpoint',
  'frontend',
  'migration',
  'schema',
  'server',
  'test',
  'tests',
  'ui',
  'view'
])
const STOP_WORDS = new Set([
  'a',
  'add',
  'an',
  'and',
  'app',
  'application',
  'are',
  'as',
  'at',
  'be',
  'build',
  'by',
  'can',
  'change',
  'check',
  'create',
  'feature',
  'fix',
  'flow',
  'for',
  'from',
  'implement',
  'in',
  'investigate',
  'is',
  'it',
  'make',
  'of',
  'on',
  'or',
  'please',
  'remove',
  'rename',
  'review',
  'route',
  'should',
  'support',
  'system',
  'that',
  'the',
  'this',
  'to',
  'update',
  'user',
  'users',
  'verify',
  'with'
])
const UNCERTAIN =
  /\b(?:apparently|could|likely|may|might|possibly|seems?|suspect(?:ed)?|unconfirmed)\b/i
const ROOT_CAUSE = /\b(?:because of|because|caused by|due to|root cause(?: is|:)?)[\s:]+(.{3,160})/i
const LEADING_MARKER = /^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/
const SENTENCE_START =
  /^(?:add|build|change|create|fix|implement|investigate|remove|rename|review|update|verify)\b/i

type Unit = { text: string; sourceItemIds: string[]; terms: string[]; rootCause: string | null }
type Group = { units: Unit[]; terms: Set<string>; rootCause: string | null }

function boundedSource(source: StructuredTaskProposalSource): {
  source: StructuredTaskProposalSource
  text: string
  truncated: boolean
} {
  const passages = source.passages.slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.sourcePassages)
  let remaining = STRUCTURED_TASK_PROPOSAL_LIMITS.sourceCharacters
  let truncated = passages.length < source.passages.length
  const bounded = passages
    .map((passage) => {
      const text = passage.text.slice(0, Math.max(remaining, 0))
      remaining -= text.length
      truncated ||= text.length < passage.text.length
      return { ...passage, text }
    })
    .filter((passage) => passage.text.trim())
  return {
    source: { ...source, passages: bounded },
    text: bounded.map((p) => p.text).join('\n\n'),
    truncated
  }
}

function topicTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? [])]
    .filter((word) => !STOP_WORDS.has(word) && !LAYER_WORDS.has(word))
    .slice(0, 12)
}

function splitPassage(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const units: string[] = []
  let current = ''
  const flush = (): void => {
    if (current.trim()) {
      units.push(current.trim())
    }
    current = ''
  }
  for (const line of lines) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (LEADING_MARKER.test(line)) {
      flush()
      current = line.replace(LEADING_MARKER, '')
    } else {
      current = current ? `${current}\n${line.trim()}` : line.trim()
    }
  }
  flush()
  if (units.length !== 1) {
    return units
  }
  const sentences = units[0]!.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean)
  return sentences.length > 1 && sentences.every((sentence) => SENTENCE_START.test(sentence))
    ? sentences
    : units
}

function sourceUnits(source: StructuredTaskProposalSource): Unit[] {
  const analyzedPassages =
    source.kind === 'review'
      ? source.passages.filter((passage) => passage.itemId === source.anchor.itemId)
      : source.passages
  return analyzedPassages
    .flatMap((passage) =>
      splitPassage(passage.text).map((text) => {
        const cause =
          ROOT_CAUSE.exec(text)?.[1]
            ?.replace(/[.;].*$/s, '')
            .trim() ?? null
        return { text, sourceItemIds: [passage.itemId], terms: topicTerms(text), rootCause: cause }
      })
    )
    .slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.sourcePassages)
}

function sharesOutcome(group: Group, unit: Unit): boolean {
  if (group.rootCause && unit.rootCause) {
    const left = topicTerms(group.rootCause)
    const right = new Set(topicTerms(unit.rootCause))
    if (left.some((term) => right.has(term))) {
      return true
    }
  }
  return unit.terms.some((term) => group.terms.has(term))
}

function groupUnits(units: Unit[]): Group[] {
  const groups: Group[] = []
  for (const unit of units) {
    const existing = groups.find((group) => sharesOutcome(group, unit))
    if (existing) {
      existing.units.push(unit)
      unit.terms.forEach((term) => existing.terms.add(term))
      existing.rootCause ??= unit.rootCause
    } else {
      groups.push({ units: [unit], terms: new Set(unit.terms), rootCause: unit.rootCause })
    }
  }
  // Layer-only bullets do not prove independent outcomes; keeping them together avoids file-shaped plans.
  if (groups.length > 1 && groups.every((group) => group.terms.size === 0)) {
    return [{ units, terms: new Set(), rootCause: null }]
  }
  return groups.slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.proposalItems)
}

function conciseName(text: string, uncertain: boolean): string {
  const cleaned = text
    .replace(LEADING_MARKER, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;]+$/, '')
  const clipped = cleaned.length > 72 ? `${cleaned.slice(0, 69).trimEnd()}…` : cleaned
  return uncertain ? `Verify: ${clipped.replace(/^verify\s+/i, '')}` : clipped
}

function groupCandidate(group: Group): StructuredTaskProposalCandidate {
  const text = group.units.map((unit) => unit.text).join('\n')
  const uncertain = group.units.some((unit) => UNCERTAIN.test(unit.text))
  const first = group.units[0]!.text
  return {
    name: conciseName(first, uncertain),
    scope: uncertain
      ? `Verify whether this finding is reproducible before proposing a fix.\n\n${text}`
      : text,
    verification: uncertain
      ? 'Record reproduction evidence and the resulting confirmed or rejected finding.'
      : 'Verify the outcome independently and record the evidence.',
    sourceItemIds: [...new Set(group.units.flatMap((unit) => unit.sourceItemIds))],
    context: text,
    uncertain
  }
}

export function normalizeStructuredTaskProposal(
  sourceInput: StructuredTaskProposalSource,
  candidates: readonly StructuredTaskProposalCandidate[],
  analysis: StructuredTaskProposal['analysis']
): StructuredTaskProposal {
  const bounded = boundedSource(sourceInput)
  const proposalId = stableStructuredTaskProposalId([
    bounded.source.sessionId,
    bounded.source.anchor.epoch,
    bounded.source.anchor.itemId,
    bounded.text
  ])
  const clipped = candidates.slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.proposalItems)
  const ids = clipped.map((candidate, index) =>
    stableStructuredTaskProposalId([proposalId, String(index), candidate.name, candidate.scope])
  )
  const items: StructuredTaskProposalItem[] = clipped.map((candidate, index) => {
    const itemId = ids[index]!
    const sourceItemIds =
      candidate.sourceItemIds?.filter((id) =>
        bounded.source.passages.some((passage) => passage.itemId === id)
      ) ?? bounded.source.passages.map((passage) => passage.itemId)
    return {
      itemId,
      branchId: structuredTaskProposalBranchId(proposalId, itemId),
      name: candidate.name.trim().slice(0, 120) || `Part ${index + 1}`,
      scope: candidate.scope.trim().slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.itemCharacters),
      verification:
        candidate.verification?.trim().slice(0, 1_000) || 'Verify the outcome independently.',
      dependencyIds: (candidate.dependencyIndexes ?? [])
        .map((position) => ids[position])
        .filter(Boolean) as string[],
      workspaceId: candidate.workspaceId || bounded.source.workspaceId,
      context: {
        content: (candidate.context ?? candidate.scope)
          .trim()
          .slice(0, STRUCTURED_TASK_PROPOSAL_LIMITS.itemCharacters),
        sourceItemIds: [...new Set(sourceItemIds)]
      },
      relationKind: 'subtask',
      action: 'prepare',
      uncertain: Boolean(candidate.uncertain)
    }
  })
  return {
    proposalId,
    source: bounded.source,
    items,
    shouldOffer: items.length > 1,
    analysis,
    truncated: bounded.truncated || candidates.length > items.length
  }
}

export function createStructuredTaskProposal(
  source: StructuredTaskProposalSource
): StructuredTaskProposal {
  const bounded = boundedSource(source)
  const candidates = groupUnits(sourceUnits(bounded.source)).map(groupCandidate)
  return normalizeStructuredTaskProposal(source, candidates, 'deterministic')
}
