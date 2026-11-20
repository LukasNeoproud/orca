import { describe, expect, it } from 'vitest'

import { getOpenInAppPresets } from '@/lib/open-in-app-catalog'
import { createAddedOpenInApplication, getOpenInAddAppEntries } from './open-in-add-app-entries'

const studio = {
  id: 'android-studio',
  label: 'Android Studio',
  command: '/Users/ada/Library/Application Support/JetBrains/Toolbox/scripts/studio'
}
const vscode = { id: 'vscode', label: 'VS Code', command: 'code' }

describe('getOpenInAddAppEntries', () => {
  it('lists found editors first and keeps the presets that were not found', () => {
    const entries = getOpenInAddAppEntries([vscode, studio], getOpenInAppPresets(), [])

    expect(entries.installed.map((entry) => entry.application)).toEqual([vscode, studio])
    expect(entries.others.map((entry) => entry.application.id)).toEqual(['cursor', 'zed'])
  })

  it('offers only the presets until the main process answers', () => {
    const entries = getOpenInAddAppEntries(null, getOpenInAppPresets(), [])

    expect(entries.installed).toEqual([])
    expect(entries.others.map((entry) => entry.application.id)).toEqual(['vscode', 'cursor', 'zed'])
  })

  it('marks an editor added under another spelling of its launcher', () => {
    const entries = getOpenInAddAppEntries([vscode, studio], getOpenInAppPresets(), [
      { id: 'mine', label: 'Studio', command: 'studio64' },
      { id: 'vscode', label: 'VS Code', command: '/usr/local/bin/code' }
    ])

    expect(entries.installed.map((entry) => entry.added)).toEqual([true, true])
    expect(entries.others.map((entry) => entry.added)).toEqual([false, false])
  })

  it('does not count another VS Code channel as VS Code', () => {
    const entries = getOpenInAddAppEntries([vscode], getOpenInAppPresets(), [
      { id: 'insiders', label: 'Insiders', command: 'code-insiders' }
    ])

    expect(entries.installed[0]?.added).toBe(false)
  })
})

describe('createAddedOpenInApplication', () => {
  it('keeps the catalog id for a new editor', () => {
    expect(createAddedOpenInApplication(studio, [vscode], () => 'fresh')).toEqual(studio)
  })

  it('gives a fresh id when an edited preset row already holds it', () => {
    const edited = { id: 'vscode', label: 'Insiders', command: 'code-insiders' }
    expect(createAddedOpenInApplication(vscode, [edited], () => 'fresh')).toEqual({
      ...vscode,
      id: 'fresh'
    })
  })
})
