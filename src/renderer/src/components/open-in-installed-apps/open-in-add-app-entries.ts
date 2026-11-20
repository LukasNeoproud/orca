import type { OpenInApplication } from '../../../../shared/ui-chrome-types'
import { isOpenInAppPresetAdded, type OpenInAppPreset } from '@/lib/open-in-app-catalog'

export type OpenInAddAppEntry = {
  application: OpenInApplication
  added: boolean
}

export type OpenInAddAppEntries = {
  /** Editors found on this computer, with the command that opens each here. */
  installed: OpenInAddAppEntry[]
  /** Presets that were not found; offered as before, with their bare launcher. */
  others: OpenInAddAppEntry[]
}

export function createPresetOpenInApplication(preset: OpenInAppPreset): OpenInApplication {
  return { id: preset.id, label: preset.label, command: preset.command }
}

export function getOpenInAddAppEntries(
  installed: readonly OpenInApplication[] | null,
  presets: readonly OpenInAppPreset[],
  draft: readonly OpenInApplication[]
): OpenInAddAppEntries {
  const toEntry = (application: OpenInApplication): OpenInAddAppEntry => ({
    application,
    added: isOpenInAppPresetAdded(draft, application)
  })
  const installedIds = new Set((installed ?? []).map((application) => application.id))
  return {
    installed: (installed ?? []).map((application) => {
      // Why: a preset keeps its localized label when it is the one found.
      const preset = presets.find((entry) => entry.id === application.id)
      return toEntry(preset ? { ...application, label: preset.label } : application)
    }),
    others: presets
      .filter((preset) => !installedIds.has(preset.id))
      .map((preset) => toEntry(createPresetOpenInApplication(preset)))
  }
}

/** `application` as a new row; a taken id (an edited preset row) gets a fresh one. */
export function createAddedOpenInApplication(
  application: OpenInApplication,
  draft: readonly OpenInApplication[],
  createId: () => string
): OpenInApplication {
  const idTaken = draft.some((entry) => entry.id === application.id)
  return { ...application, id: idTaken ? createId() : application.id }
}
