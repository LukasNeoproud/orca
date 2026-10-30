import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeAzureDevOpsReviewPiExtension } from './azure-devops-review-pi-extension'

describe('writeAzureDevOpsReviewPiExtension', () => {
  const roots: string[] = []
  const root = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-pi-ext-'))
    roots.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of roots.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the extension once and rewrites it only when the CLI changes', () => {
    const dir = join(root(), 'pi-review-extension')
    const path = writeAzureDevOpsReviewPiExtension(dir, 'orca')
    expect(path).toBe(join(dir, 'orca-ado-review-tools.ts'))
    expect(readFileSync(path!, 'utf8')).toContain('const CLI = "orca"')
    const written = statSync(path!).mtimeMs

    expect(writeAzureDevOpsReviewPiExtension(dir, 'orca')).toBe(path)
    expect(statSync(path!).mtimeMs).toBe(written)

    expect(writeAzureDevOpsReviewPiExtension(dir, 'orca-dev')).toBe(path)
    expect(readFileSync(path!, 'utf8')).toContain('const CLI = "orca-dev"')
  })

  it('returns null when the extension cannot be written', () => {
    const blocker = join(root(), 'file')
    writeFileSync(blocker, '')
    expect(writeAzureDevOpsReviewPiExtension(join(blocker, 'nested'), 'orca')).toBeNull()
  })
})
