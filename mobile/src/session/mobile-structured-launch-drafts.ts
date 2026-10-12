type StagedStructuredLaunchDraft = {
  text: string
  createdAt: number
}

const MAX_STAGED_DRAFTS = 128
const stagedDrafts = new Map<string, StagedStructuredLaunchDraft>()

function key(hostId: string, sessionId: string): string {
  return JSON.stringify([hostId, sessionId])
}

export function stageMobileStructuredLaunchDraft(args: {
  hostId: string
  sessionId: string
  text: string
  createdAt?: number
}): void {
  if (!args.hostId || !args.sessionId || !args.text.trim()) {
    return
  }
  const draftKey = key(args.hostId, args.sessionId)
  stagedDrafts.delete(draftKey)
  stagedDrafts.set(draftKey, { text: args.text, createdAt: args.createdAt ?? Date.now() })
  while (stagedDrafts.size > MAX_STAGED_DRAFTS) {
    const oldest = stagedDrafts.keys().next().value
    if (oldest === undefined) {
      return
    }
    stagedDrafts.delete(oldest)
  }
}

export function readMobileStructuredLaunchDraft(
  hostId: string,
  sessionId: string | null
): StagedStructuredLaunchDraft | null {
  return sessionId ? (stagedDrafts.get(key(hostId, sessionId)) ?? null) : null
}

export function clearMobileStructuredLaunchDraft(hostId: string, sessionId: string): void {
  stagedDrafts.delete(key(hostId, sessionId))
}

/** A Backlog launch stages its prompt on the phone before the host lists the tab's draft. */
export function resolveMobileChatLaunchDraft(
  hostId: string,
  sessionId: string | null,
  tab: { launchDraft?: string | null; launchDraftCreatedAt?: number | null } | null
): { text: string | null; createdAt: number | null } {
  const staged = readMobileStructuredLaunchDraft(hostId, sessionId)
  return {
    text: tab?.launchDraft ?? staged?.text ?? null,
    createdAt: tab?.launchDraftCreatedAt ?? staged?.createdAt ?? null
  }
}
