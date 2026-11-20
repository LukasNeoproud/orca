import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QualityGateProposal } from '../../shared/quality-gate-proposal'
import { createQualityGateProposalStore } from './quality-gate-proposal-store'

const proposal = (repoId: string, name = 'Lint'): QualityGateProposal => ({
  id: `proposal-${repoId}-${name}`,
  repoId,
  worktreeId: `${repoId}::/work`,
  proposedAt: 1_000,
  proposedBy: { kind: 'local-cli' },
  items: [{ id: 'item-1', name, command: 'pnpm lint', required: true, timeoutSeconds: 600 }]
})

describe('store of pending quality gate proposals', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-proposal-store-'))
    filePath = join(dir, 'nested', 'quality-gate-proposals.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps one proposal per repository and survives a restart', () => {
    const store = createQualityGateProposalStore({ filePath })
    expect(store.get('a')).toBeNull()
    store.put(proposal('a'))
    store.put(proposal('b'))
    store.put(proposal('a', 'Build'))

    const afterRestart = createQualityGateProposalStore({ filePath })
    expect(afterRestart.get('a')).toEqual(proposal('a', 'Build'))
    expect(afterRestart.get('b')).toEqual(proposal('b'))
    expect(JSON.parse(readFileSync(filePath, 'utf-8')).proposals).toHaveLength(2)

    afterRestart.remove('a')
    expect(store.get('a')).toBeNull()
    expect(store.get('b')).toEqual(proposal('b'))
  })

  it('reads an unreadable file as no proposal and drops what is not one', () => {
    const store = createQualityGateProposalStore({ filePath: join(dir, 'broken.json') })
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    expect(store.get('a')).toBeNull()
    writeFileSync(
      join(dir, 'broken.json'),
      JSON.stringify({
        version: 1,
        proposals: [
          { ...proposal('a'), items: [{ id: 'item-1', name: 'No command' }] },
          'pnpm lint',
          { ...proposal('b'), accepted: true }
        ]
      })
    )
    expect(store.get('a')).toBeNull()
    expect(store.get('b')).toEqual(proposal('b'))
  })

  it('makes room by dropping the oldest proposals', () => {
    const store = createQualityGateProposalStore({ filePath })
    for (let index = 0; index < 201; index++) {
      store.put(proposal(`repo-${index}`))
    }
    expect(store.get('repo-0')).toBeNull()
    expect(store.get('repo-1')).not.toBeNull()
    expect(store.get('repo-200')).not.toBeNull()
  })
})
