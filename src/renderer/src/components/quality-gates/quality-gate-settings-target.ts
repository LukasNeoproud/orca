/** Anchor of a repository's Quality Gates section, for settings deep links. */
export function getRepositoryQualityGatesSectionId(repoId: string): string {
  return `repo-${repoId}-quality-gates`
}
