import { create } from 'zustand'
import {
  normalizeAzureDevOpsAutoReviewSettings,
  type AzureDevOpsAutoReviewSettings
} from '../../../shared/azure-devops-auto-review'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

const SETTINGS_KEY = 'orca.azureDevOpsReview.autoReview'
const HANDLED_KEY = 'orca.azureDevOpsReview.autoReviewHandled'
const UNOPENED_KEY = 'orca.azureDevOpsReview.unopenedRequests'
const ANNOUNCED_KEY = 'orca.azureDevOpsReview.announcedRequests'

type AutoReviewState = {
  settings: AzureDevOpsAutoReviewSettings
  /** Pull requests already offered and answered, or open before the first check; null before it. */
  handledKeys: ReadonlySet<string> | null
  /** New review requests the user has not opened yet; the list marks them. */
  unopenedKeys: ReadonlySet<string>
  /** Review requests whose one system notification is spent, so a restart does not repeat it. */
  announcedKeys: ReadonlySet<string>
  /** The pull request whose review options dialog is open. */
  choosingOptionsFor: AzureDevOpsReviewPullRequest | null
  setSettings: (patch: Partial<AzureDevOpsAutoReviewSettings>) => void
  markHandled: (keys: readonly string[]) => void
  /** Keeps only keys still listed, so the stored set does not grow with every merged PR. */
  retainHandled: (listedKeys: ReadonlySet<string>) => void
  markUnopened: (keys: readonly string[]) => void
  markAnnounced: (keys: readonly string[]) => void
  /** Clears the mark; a pull request opened before it was noticed as new is not news either. */
  markOpened: (key: string) => void
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

function readKeys(storageKey: string): ReadonlySet<string> | null {
  const stored = readJson(storageKey)
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
  const replaceUnopened = (keys: ReadonlySet<string>): void => {
    set({ unopenedKeys: keys })
    writeJson(UNOPENED_KEY, [...keys])
  }
  const replaceAnnounced = (keys: ReadonlySet<string>): void => {
    set({ announcedKeys: keys })
    writeJson(ANNOUNCED_KEY, [...keys])
  }
  const hasMissing = (keys: ReadonlySet<string>, added: readonly string[]): boolean =>
    added.some((key) => !keys.has(key))
  const hasUnlisted = (keys: ReadonlySet<string>, listed: ReadonlySet<string>): boolean =>
    [...keys].some((key) => !listed.has(key))
  const onlyListed = (keys: ReadonlySet<string>, listed: ReadonlySet<string>): Set<string> =>
    new Set([...keys].filter((key) => listed.has(key)))
  return {
    settings: normalizeAzureDevOpsAutoReviewSettings(readJson(SETTINGS_KEY)),
    handledKeys: readKeys(HANDLED_KEY),
    unopenedKeys: readKeys(UNOPENED_KEY) ?? new Set(),
    announcedKeys: readKeys(ANNOUNCED_KEY) ?? new Set(),
    choosingOptionsFor: null,
    setSettings: (patch) => {
      const settings = normalizeAzureDevOpsAutoReviewSettings({ ...get().settings, ...patch })
      set({ settings })
      writeJson(SETTINGS_KEY, settings)
    },
    markHandled: (keys) => replaceHandled(new Set([...(get().handledKeys ?? []), ...keys])),
    retainHandled: (listedKeys) => {
      const { handledKeys, unopenedKeys, announcedKeys } = get()
      if (handledKeys && hasUnlisted(handledKeys, listedKeys)) {
        replaceHandled(onlyListed(handledKeys, listedKeys))
      }
      if (hasUnlisted(unopenedKeys, listedKeys)) {
        replaceUnopened(onlyListed(unopenedKeys, listedKeys))
      }
      if (hasUnlisted(announcedKeys, listedKeys)) {
        replaceAnnounced(onlyListed(announcedKeys, listedKeys))
      }
    },
    markUnopened: (keys) => {
      if (hasMissing(get().unopenedKeys, keys)) {
        replaceUnopened(new Set([...get().unopenedKeys, ...keys]))
      }
    },
    markAnnounced: (keys) => {
      if (hasMissing(get().announcedKeys, keys)) {
        replaceAnnounced(new Set([...get().announcedKeys, ...keys]))
      }
    },
    markOpened: (key) => {
      const { unopenedKeys } = get()
      if (unopenedKeys.has(key)) {
        replaceUnopened(new Set([...unopenedKeys].filter((entry) => entry !== key)))
      }
      get().markAnnounced([key])
    },
    chooseOptionsFor: (pullRequest) => set({ choosingOptionsFor: pullRequest })
  }
})
