import type { ExecutionHostId } from '../../../../shared/execution-host'
import { SimplifiedBranchField } from './SimplifiedBranchField'
import { useSimplifiedBranchSearch } from './use-simplified-branch-search'

export function SimplifiedBaseBranchField({
  repoId,
  hostId,
  value,
  onChange,
  onSubmit
}: {
  repoId: string
  hostId?: ExecutionHostId | null
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}): React.JSX.Element {
  const branches = useSimplifiedBranchSearch(true, repoId, value, hostId)
  return (
    <SimplifiedBranchField
      mode="base"
      value={value}
      branches={branches}
      onChange={onChange}
      onSelect={(row) => {
        if (row) {
          onChange(row.refName)
        }
      }}
      onSubmit={onSubmit}
    />
  )
}
