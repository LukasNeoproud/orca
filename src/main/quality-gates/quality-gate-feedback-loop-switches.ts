import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

type SwitchFile = { version: 1; disabledWorktreeIds: string[] }

// A removed workspace leaves its id behind; the oldest entries make room.
const MAX_DISABLED_WORKTREES = 500

export type QualityGateFeedbackLoopSwitches = {
  isDisabled(worktreeId: string): boolean
  setDisabled(worktreeId: string, disabled: boolean): void
}

export function defaultQualityGateFeedbackLoopSwitchesPath(): string {
  return join(getAppEnvironment().getPath('userData'), 'quality-gate-feedback-loop.json')
}

/**
 * Workspaces whose feedback loop the user turned off, on the host that owns them. Only "off" is
 * stored: the loop itself is turned on in the repository settings and nowhere else.
 *
 * Why every call reads the file: two Orca builds can share one data directory, as with the runs.
 */
export function createQualityGateFeedbackLoopSwitches(options: {
  filePath: string
}): QualityGateFeedbackLoopSwitches {
  function load(): string[] {
    if (!existsSync(options.filePath)) {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(options.filePath, 'utf-8'))
      const ids: unknown =
        parsed && typeof parsed === 'object' && 'disabledWorktreeIds' in parsed
          ? parsed.disabledWorktreeIds
          : null
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  return {
    isDisabled: (worktreeId) => load().includes(worktreeId),
    setDisabled: (worktreeId, disabled) => {
      const others = load().filter((id) => id !== worktreeId)
      const file: SwitchFile = {
        version: 1,
        disabledWorktreeIds: (disabled ? [...others, worktreeId] : others).slice(
          -MAX_DISABLED_WORKTREES
        )
      }
      mkdirSync(dirname(options.filePath), { recursive: true })
      writeFileDurableSync(
        durableWriteTempPath(options.filePath),
        options.filePath,
        JSON.stringify(file)
      )
    }
  }
}
