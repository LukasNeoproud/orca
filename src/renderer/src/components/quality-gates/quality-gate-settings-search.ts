import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../shared/repo-types'
import type { SettingsSearchEntry } from '../settings/settings-search'
import { translateSearchKeyword } from '../settings/settings-search-keywords'

/** What the settings search matches the quality gate section of a repository on. */
export function getQualityGateSettingsSearchEntries(repo: Repo): SettingsSearchEntry[] {
  return [
    {
      title: translate('qualityGates.title', 'Quality Gates'),
      description: translate(
        'qualityGates.searchDescription',
        'Commands that check the work in a workspace: lint, tests, a build.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword('qualityGates.searchKeywordGate', 'gate'),
        ...translateSearchKeyword('qualityGates.searchKeywordCheck', 'check'),
        ...translateSearchKeyword('qualityGates.searchKeywordLint', 'lint'),
        ...translateSearchKeyword('qualityGates.searchKeywordTests', 'tests'),
        ...translateSearchKeyword('qualityGates.searchKeywordBuild', 'build'),
        ...translateSearchKeyword('qualityGates.searchKeywordLoop', 'feedback loop')
      ]
    }
  ]
}
