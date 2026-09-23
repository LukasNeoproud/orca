import {
  readMobileStructuredLaunchDraft,
  stageMobileStructuredLaunchDraft
} from './mobile-structured-launch-drafts'

/** Carries the typed message and any prepared reference into the selected copy. */
export function stageMobileStructuredContinuationDraft(
  hostId: string,
  sessionId: string,
  sourceDraft: string
): void {
  const prepared = readMobileStructuredLaunchDraft(hostId, sessionId)?.text.trim()
  const text = [prepared, sourceDraft.trim()].filter(Boolean).join('\n\n')
  if (text) {
    stageMobileStructuredLaunchDraft({ hostId, sessionId, text })
  }
}
