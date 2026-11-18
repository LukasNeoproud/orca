import { translate } from '@/i18n/i18n'
import type { ExternalEditorFileSource } from './external-editor-file-target'

/** What a diff offers for Open in: the workspace file, or a sentence saying why there is none. */
export type ExternalEditorFileAvailability =
  | { file: ExternalEditorFileSource }
  | { unavailableReason: string }

export function getExternalEditorAvailableFile(
  availability: ExternalEditorFileAvailability | null
): ExternalEditorFileSource | null {
  return availability && 'file' in availability ? availability.file : null
}

export function getExternalEditorUnavailableReason(
  availability: ExternalEditorFileAvailability | null
): string | null {
  return availability && 'unavailableReason' in availability ? availability.unavailableReason : null
}

export function describeDeletedExternalEditorFile(): string {
  return translate(
    'components.openInExternalEditor.unavailableDeleted',
    'This file is deleted, so there is nothing to open.'
  )
}
