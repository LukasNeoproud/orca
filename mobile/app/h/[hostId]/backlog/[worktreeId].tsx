import { useLocalSearchParams } from 'expo-router'
import { MobileBacklogPanel } from '../../../../src/backlog/MobileBacklogPanel'

export default function MobileBacklogScreen() {
  const { hostId, worktreeId, name } = useLocalSearchParams<{
    hostId: string
    worktreeId: string
    name?: string
  }>()
  return (
    <MobileBacklogPanel
      key={`${hostId}:${worktreeId}`}
      hostId={hostId}
      worktreeId={worktreeId}
      name={name}
    />
  )
}
