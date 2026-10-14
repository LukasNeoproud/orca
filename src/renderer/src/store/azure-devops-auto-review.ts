import { create } from 'zustand'
import {
  normalizeAzureDevOpsAutoReviewSettings,
  type AzureDevOpsAutoReviewSettings
} from '../../../shared/azure-devops-auto-review'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

const SETTINGS_KEY = 'orca.azureDevOpsReview.autoReview'
const HANDLED_KEY = 'orca.azureDevOpsReview.autoReviewHandled'

type AutoReviewState = {
  settings: AzureDevOpsAutoReviewSettings
  /** Pull requests already offered and answered, or open before the first check; null before it. */
  handledKeys: ReadonlySet<string> | null
  /** The pull request whose review options dialog is open. */
  choosingOptionsFor: AzureDevOpsReviewPullRequest | null
  setSettings: (patch: Partial<AzureDevOpsAutoReviewSettings>) => void
  markHandled: (keys: readonly string[]) => void
  /** Keeps only keys still listed, so the stored set does not grow with every merged PR. */
  retainHandled: (listedKeys: ReadonlySet<string>) => void
  chooseOptionsFor: (pullRequest: AzureDevOpsReviewPullRequest | null) => void
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Lost storage only repeats a notification or the default interval.
  }
}

function readHandledKeys(): ReadonlySet<string> | null {
  const stored = readJson(HANDLED_KEY)
  return Array.isArray(stored)
    ? new Set(stored.filter((key): key is string => typeof key === 'string'))
    : null
}

// Why renderer-local: which notifications this desktop answered is a UI convenience, not PR data.
export const useAzureDevOpsAutoReview = create<AutoReviewState>((set, get) => {
  const replaceHandled = (keys: ReadonlySet<string>): void => {
    set({ handledKeys: keys })
    writeJson(HANDLED_KEY, [...keys])
  }
  return {
    settings: normalizeAzureDevOpsAutoReviewSettings(readJson(SETTINGS_KEY)),
    handledKeys: readHandledKeys(),
    choosingOptionsFor: null,
    setSettings: (patch) => {
      const settings = normalizeAzureDevOpsAutoReviewSettings({ ...get().settings, ...patch })
      set({ settings })
      writeJson(SETTINGS_KEY, settings)
    },
    markHandled: (keys) => replaceHandled(new Set([...(get().handledKeys ?? []), ...keys])),
    retainHandled: (listedKeys) => {
      const current = get().handledKeys
      if (current && [...current].some((key) => !listedKeys.has(key))) {
        replaceHandled(new Set([...current].filter((key) => listedKeys.has(key))))
      }
    },
    chooseOptionsFor: (pullRequest) => set({ choosingOptionsFor: pullRequest })
  }
})
