import { describe, expect, it } from 'vitest'
import { nativeChatPreviewKind, previewCodeLanguage } from './native-chat-preview-kind'

describe('native chat file preview detection', () => {
  it('recognizes supported formats from cross-platform paths and MIME types', () => {
    expect(nativeChatPreviewKind('C:\\repo\\graph.svg')).toBe('image')
    expect(nativeChatPreviewKind('/repo/flow.mmd')).toBe('mermaid')
    expect(nativeChatPreviewKind('/repo/table.tsv')).toBe('csv')
    expect(nativeChatPreviewKind('/repo/report.junit.xml')).toBe('report')
    expect(nativeChatPreviewKind('/repo/test-results.json', 'application/json')).toBe('report')
    expect(nativeChatPreviewKind('/repo/results.tap')).toBe('report')
    expect(nativeChatPreviewKind('/repo/unknown', 'application/pdf')).toBe('pdf')
    expect(nativeChatPreviewKind('/repo/data.bin')).toBe('unsupported')
  })

  it('maps common source extensions to highlighting languages', () => {
    expect(previewCodeLanguage('/repo/main.tsx')).toBe('typescript')
    expect(previewCodeLanguage('C:\\repo\\main.py')).toBe('python')
  })
})
