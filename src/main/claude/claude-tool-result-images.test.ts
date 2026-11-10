import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeToolBody } from './claude-structured-item-translation'
import { claudeAutoCompactionRowBody } from './claude-informational-row'
import {
  claudeToolResultImagesBody,
  setClaudeToolImageDirectory
} from './claude-tool-result-images'

let root: string | null = null
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

describe('what a tool result shows beyond its text', () => {
  it('keeps the images a tool returned as files the transcript can show', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-tool-images-'))
    setClaudeToolImageDirectory(root)
    const png = Buffer.from('not really a png').toString('base64')
    const body = claudeToolResultImagesBody('session/1', 'toolu_1', [
      { type: 'text', text: 'Screenshot taken' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
      { type: 'image', source: { type: 'base64', media_type: 'application/pdf', data: png } }
    ])
    expect(body).toMatchObject({ kind: 'message', role: 'assistant' })
    const [block] = body?.blocks ?? []
    expect(body?.blocks).toHaveLength(1)
    expect(block).toMatchObject({ type: 'image-ref' })
    const path = block?.type === 'image-ref' ? block.path : undefined
    expect(path).toBe(join(root, 'session_1', 'toolu_1-1.png'))
    expect((await readFile(path!)).toString()).toBe('not really a png')
    expect(claudeToolResultImagesBody('session/1', 'toolu_2', 'plain text')).toBeNull()
  })

  it('lists a web search’s hits as the row’s sources', () => {
    const output =
      'Web search results for query: "x"\n\nLinks: [{"title":"A","url":"https://a.example"},{"title":"A again","url":"https://a.example"},{"url":"javascript:alert(1)"}]\n\nSummary'
    expect(
      claudeToolBody({
        tool: { id: 't', name: 'WebSearch', input: { query: 'x' } },
        result: { toolUseId: 't', output, failed: false, content: output }
      })
    ).toMatchObject({ webSearchResults: [{ title: 'A', url: 'https://a.example' }] })
    expect(
      claudeToolBody({
        tool: { id: 't', name: 'Bash', input: {} },
        result: { toolUseId: 't', output, failed: false, content: output }
      })
    ).not.toHaveProperty('webSearchResults')
  })

  it('says an automatic compaction happened, and leaves a /compact to its own turn', () => {
    expect(claudeAutoCompactionRowBody({ compact_metadata: { trigger: 'auto' } })).toEqual({
      kind: 'status',
      text: 'Context compacted',
      presentation: 'compaction'
    })
    expect(claudeAutoCompactionRowBody({ compact_metadata: { trigger: 'manual' } })).toBeNull()
  })
})
