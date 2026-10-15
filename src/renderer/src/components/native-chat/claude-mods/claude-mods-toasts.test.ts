import { describe, expect, it } from 'vitest'
import { ClaudeModsToaster, claudeModsToastLine } from './claude-mods-toasts'

function toaster(visible = true) {
  const shown: { message: string; id: string; duration: number; description: string }[] = []
  let now = 1_000
  const instance = new ClaudeModsToaster(
    's1',
    visible,
    (message, data) => shown.push({ message, ...data }),
    () => now
  )
  return {
    instance,
    shown,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('ClaudeModsToaster', () => {
  it('names the toast per session and plugin and floors its time at 6 s', () => {
    const { instance, shown } = toaster()
    instance.push('p', 'hello', 1000)
    instance.push('q', 'there')
    expect(shown[0]).toMatchObject({ id: 'claude-mods:s1:p', description: 'p', duration: 6000 })
    expect(shown[1]).toMatchObject({ id: 'claude-mods:s1:q', duration: 6000 })
    instance.push('r', 'long', 12_000)
    expect(shown[2]?.duration).toBe(12_000)
  })

  it('counts repeats from a plugin while its toast is still up', () => {
    const { instance, shown, advance } = toaster()
    instance.push('p', 'saved')
    advance(1000)
    instance.push('p', 'saved')
    advance(1000)
    instance.push('p', 'saved')
    expect(shown.map((entry) => entry.message)).toEqual(['saved', 'saved (×2)', 'saved (×3)'])
    advance(7000)
    instance.push('p', 'saved')
    expect(shown[3]?.message).toBe('saved')
  })

  it('holds the newest toast of a hidden chat until it is seen', () => {
    const { instance, shown, advance } = toaster(false)
    instance.push('p', 'first')
    advance(100)
    instance.push('p', 'second')
    expect(shown).toHaveLength(0)
    instance.setVisible(true)
    expect(shown.map((entry) => entry.message)).toEqual(['second'])
  })

  it('drops a held toast that outlived its own time', () => {
    const { instance, shown, advance } = toaster(false)
    instance.push('p', 'stale')
    advance(6001)
    instance.setVisible(true)
    expect(shown).toHaveLength(0)
  })
})

describe('claudeModsToastLine', () => {
  it('collapses lines and cuts at 240 code points', () => {
    expect(claudeModsToastLine('a\n\tb  c')).toBe('a b c')
    const cut = claudeModsToastLine('😀'.repeat(300))
    expect(Array.from(cut)).toHaveLength(240)
    expect(cut.endsWith('…')).toBe(true)
  })
})
