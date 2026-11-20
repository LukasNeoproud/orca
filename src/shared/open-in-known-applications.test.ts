import { describe, expect, it } from 'vitest'
import {
  KNOWN_OPEN_IN_APPLICATIONS,
  findKnownOpenInApplication,
  getOpenInLauncherIdentity
} from './open-in-known-applications'

describe('getOpenInLauncherIdentity', () => {
  it.each([
    ['studio', 'studio'],
    [' Code ', 'code'],
    ['/Users/ada/Library/Application Support/JetBrains/Toolbox/scripts/studio', 'studio'],
    ['/Applications/Android Studio.app/Contents/MacOS/studio', 'studio'],
    ['C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe', 'studio64'],
    ['C:\\Users\\Ada\\AppData\\Local\\JetBrains\\Toolbox\\scripts\\idea.cmd', 'idea'],
    ['/opt/android-studio/bin/studio.sh', 'studio'],
    ['"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd"', 'code'],
    ['code --reuse-window', 'code'],
    ['', '']
  ])('reads %j as %j', (command, identity) => {
    expect(getOpenInLauncherIdentity(command)).toBe(identity)
  })
})

describe('findKnownOpenInApplication', () => {
  it.each([
    ['studio', 'android-studio'],
    ['studio64', 'android-studio'],
    ['android-studio', 'android-studio'],
    ['/Applications/Android Studio.app/Contents/MacOS/studio', 'android-studio'],
    ['idea64.exe', 'intellij-idea'],
    ['intellij-idea-community', 'intellij-idea'],
    ['xed', 'xcode'],
    ['zeditor', 'zed'],
    ['code', 'vscode']
  ])('knows %s as %s', (command, id) => {
    expect(findKnownOpenInApplication(command)?.id).toBe(id)
  })

  it.each(['nvim', 'code-insiders', 'open -a Xcode', ''])('knows nothing of %j', (command) => {
    expect(findKnownOpenInApplication(command)).toBeNull()
  })

  it('keeps ids and launcher names unique', () => {
    const ids = KNOWN_OPEN_IN_APPLICATIONS.map((app) => app.id)
    const launchers = KNOWN_OPEN_IN_APPLICATIONS.flatMap((app) => [
      app.command,
      ...(app.aliases ?? [])
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(launchers).size).toBe(launchers.length)
  })
})
