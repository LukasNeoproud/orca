import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import {
  readQualityGateProposal,
  type QualityGateProposal
} from '../../shared/quality-gate-proposal'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

type ProposalFile = { version: 1; proposals: QualityGateProposal[] }

// A removed repository leaves its proposal behind; the oldest make room.
const MAX_PROPOSALS = 200

export type QualityGateProposalStore = {
  get(repoId: string): QualityGateProposal | null
  /** Takes the place of the proposal the repository had. */
  put(proposal: QualityGateProposal): void
  remove(repoId: string): void
}

export function defaultQualityGateProposalStorePath(): string {
  return join(getAppEnvironment().getPath('userData'), 'quality-gate-proposals.json')
}

/**
 * The pending proposal of each repository, in the data of the host that keeps the repository's
 * gates. A file of its own, not the repository row: what an agent sent stays out of the row the
 * gates run from.
 *
 * Why every call reads the file: two Orca builds can share one data directory, as with the runs.
 */
export function createQualityGateProposalStore(options: {
  filePath: string
}): QualityGateProposalStore {
  function load(): QualityGateProposal[] {
    if (!existsSync(options.filePath)) {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(options.filePath, 'utf-8'))
      const stored: unknown =
        parsed && typeof parsed === 'object' && 'proposals' in parsed ? parsed.proposals : null
      return (Array.isArray(stored) ? stored : [])
        .map(readQualityGateProposal)
        .filter((proposal) => proposal !== null)
    } catch {
      return []
    }
  }

  function save(proposals: QualityGateProposal[]): void {
    const file: ProposalFile = { version: 1, proposals: proposals.slice(-MAX_PROPOSALS) }
    mkdirSync(dirname(options.filePath), { recursive: true })
    writeFileDurableSync(
      durableWriteTempPath(options.filePath),
      options.filePath,
      JSON.stringify(file)
    )
  }

  const others = (repoId: string): QualityGateProposal[] =>
    load().filter((proposal) => proposal.repoId !== repoId)

  return {
    get: (repoId) => load().find((proposal) => proposal.repoId === repoId) ?? null,
    put: (proposal) => save([...others(proposal.repoId), proposal]),
    remove: (repoId) => save(others(repoId))
  }
}
