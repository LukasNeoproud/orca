import { hasQualityGateDefinitions } from '../../../../shared/quality-gate-types'
import type { Repo } from '../../../../shared/repo-types'

/**
 * Whether the Checks tab has local gates to show even without git. A folder workspace of a
 * project group has no repository settings, so nothing holds gates for it.
 */
export function checksTabShowsQualityGates(
  isFolderWorkspace: boolean,
  repo: Pick<Repo, 'qualityGates'> | null | undefined
): boolean {
  return !isFolderWorkspace && hasQualityGateDefinitions(repo?.qualityGates)
}
