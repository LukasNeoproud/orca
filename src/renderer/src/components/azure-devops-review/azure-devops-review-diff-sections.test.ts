import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewFileDiff } from '../../../../shared/azure-devops-review-types'
import {
  azureDevOpsChangeToBranchEntry,
  azureDevOpsLoadedSectionFields,
  azureDevOpsPendingSection
} from './azure-devops-review-diff-sections'

function side(content: string, flags: { binary?: boolean; tooLarge?: boolean } = {}) {
  return {
    content,
    missing: false,
    binary: flags.binary ?? false,
    tooLarge: flags.tooLarge ?? false
  }
}

function diff(
  original: AzureDevOpsReviewFileDiff['original'],
  modified: AzureDevOpsReviewFileDiff['modified']
): AzureDevOpsReviewFileDiff {
  return { iterationId: 3, original, modified }
}

describe('azure devops diff sections', () => {
  it('keys sections like the combined diff file tree', () => {
    const entry = azureDevOpsChangeToBranchEntry({
      path: 'b.ts',
      originalPath: 'a.ts',
      changeType: 'rename',
      changeTrackingId: null
    })
    expect(entry).toEqual({ path: 'b.ts', status: 'renamed', oldPath: 'a.ts' })
    expect(azureDevOpsPendingSection(entry)).toMatchObject({
      key: 'combined-commit:b.ts',
      loading: true,
      collapsed: false
    })
  })

  it('keeps text contents for a normal diff', () => {
    const fields = azureDevOpsLoadedSectionFields(diff(side('a\n'), side('b\n')))
    expect(fields).toMatchObject({
      loading: false,
      originalContent: 'a\n',
      modifiedContent: 'b\n',
      diffResult: { kind: 'text' }
    })
    expect(fields.largeDiffRenderLimit?.limited).toBe(false)
  })

  it('marks binary files without contents', () => {
    const fields = azureDevOpsLoadedSectionFields(diff(side(''), side('', { binary: true })))
    expect(fields.diffResult).toMatchObject({ kind: 'binary', modifiedIsBinary: true })
    expect(fields.modifiedContent).toBe('')
  })

  it('previews images on both sides as an image diff', () => {
    const image = { ...side('AQID', { binary: true }), imageMimeType: 'image/png' }
    const added = { ...side(''), missing: true }
    const fields = azureDevOpsLoadedSectionFields(diff(added, image))
    expect(fields.diffResult).toMatchObject({
      kind: 'binary',
      isImage: true,
      mimeType: 'image/png',
      originalContent: '',
      modifiedContent: 'AQID',
      modifiedIsBinary: true
    })
  })

  it('does not preview an image the host refused as too large', () => {
    const fields = azureDevOpsLoadedSectionFields(
      diff(side(''), { ...side('', { binary: true, tooLarge: true }), imageMimeType: 'image/png' })
    )
    expect(fields.diffResult).not.toHaveProperty('isImage')
  })

  it('forces the large-diff fallback when the host refused a side', () => {
    const fields = azureDevOpsLoadedSectionFields(diff(side('a'), side('', { tooLarge: true })))
    expect(fields.largeDiffRenderLimit?.limited).toBe(true)
    expect(fields.originalContent).toBe('')
  })
})
