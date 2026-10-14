import type { ExecutionHostId } from '../../../../shared/execution-host'
import { formatBranchRefLabel } from '../../../../shared/composer-branch-selection'
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
  const label = formatBranchRefLabel(value)
  const branches = useSimplifiedBranchSearch(true, repoId, label, hostId)
  return (
    <SimplifiedBranchField
      mode="base"
      value={label}
      branches={branches}
      onChange={onChange}
      onSelect={(row) => {
        if (row) {
          onChange(formatBranchRefLabel(row.refName))
        }
      }}
      onSubmit={onSubmit}
    />
  )
}
