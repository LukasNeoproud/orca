import { useLocalSearchParams } from 'expo-router'
import { AzureDevOpsReviewFilesScreen } from '../../../src/azure-devops-review/AzureDevOpsReviewFilesScreen'

export default function PullRequestFilesScreen() {
  const { hostId, key, path } = useLocalSearchParams<{
    hostId: string
    key: string
    path?: string
  }>()
  return (
    <AzureDevOpsReviewFilesScreen
      hostId={hostId}
      pullRequestKey={key ?? ''}
      initialPath={path ?? null}
    />
  )
}
