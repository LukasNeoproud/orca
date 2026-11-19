/**
 * Frames of `qualityGates.subscribe`. The stream carries no state: `changed` only says that the
 * runs or the tree of the workspace moved, and the client reads `qualityGates.status` again.
 */
export type QualityGateChangeFrame =
  /** `subscriptionId` is what `qualityGates.unsubscribe` takes. */
  { type: 'ready'; subscriptionId: string } | { type: 'changed' } | { type: 'end' }

/** Null for a frame this build does not know, so a newer host's frame changes nothing. */
export function readQualityGateChangeFrame(value: unknown): QualityGateChangeFrame | null {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return null
  }
  const type = value.type
  if (type === 'ready') {
    const subscriptionId = 'subscriptionId' in value ? value.subscriptionId : null
    return typeof subscriptionId === 'string' && subscriptionId ? { type, subscriptionId } : null
  }
  return type === 'changed' || type === 'end' ? { type } : null
}
