import { describe, expect, it } from 'vitest'
import { claudeModsPushEvent } from './claude-mods-surface-push'

function invalidate(instances?: unknown) {
  return claudeModsPushEvent('ui_invalidate', {
    type: 'system',
    subtype: 'ui_invalidate',
    event: 'ui.render',
    ...(instances === undefined ? {} : { instances })
  })
}

describe('ui_invalidate instances', () => {
  it('reads the object entries the 2.1.299 CLI sends, once per instance', () => {
    expect(
      invalidate([
        { surface: 'desktop', component: 'Pane', instance_id: 'board' },
        { surface: 'desktop', component: 'Pane', instance_id: 'board' },
        { surface: 'desktop', component: 'AbovePrompt', instance_id: 'above-prompt' }
      ])
    ).toEqual({ type: 'invalidate', instances: ['board', 'above-prompt'] })
  })

  it('still accepts bare ids and skips other surfaces', () => {
    expect(
      invalidate([
        'hello-tabs',
        { surface: 'terminal', component: 'Pane', instance_id: 'other' },
        { component: 'Pane', instance_id: 'no-surface' }
      ])
    ).toEqual({ type: 'invalidate', instances: ['hello-tabs', 'no-surface'] })
  })

  it('redraws everything when the field is absent or nothing in it parses', () => {
    expect(invalidate()).toEqual({ type: 'invalidate' })
    expect(invalidate([])).toEqual({ type: 'invalidate' })
    expect(invalidate([{ surface: 'desktop' }, 7, null])).toEqual({ type: 'invalidate' })
    expect(invalidate('board')).toEqual({ type: 'invalidate' })
  })
})
