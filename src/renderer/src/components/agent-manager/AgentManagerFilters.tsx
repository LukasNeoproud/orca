import { ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { ManagerFilter } from './agent-manager-model'

type Props = {
  query: string
  onQuery: (value: string) => void
  filter: ManagerFilter
  onFilter: (value: ManagerFilter) => void
  project: string
  onProject: (value: string) => void
  projects: [string, string][]
  disabled: boolean
  onSelect: (kind: 'all' | 'orphan' | 'independent' | 'none') => void
}

export function AgentManagerFilters(props: Props) {
  const filters: [ManagerFilter, string][] = [
    ['all', translate('agents.manager.all', 'All')],
    ['working', translate('agents.manager.working', 'Working')],
    ['waiting', translate('agents.manager.waitingFilter', 'Waiting')],
    ['orphan', translate('agents.manager.orphan', 'Orphan')],
    ['independent', translate('agents.manager.independent', 'Independent')]
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          aria-label={translate('agents.manager.search', 'Search agents and terminals')}
          placeholder={translate('agents.manager.search', 'Search agents and terminals')}
        />
      </div>
      <div
        className="flex gap-1"
        role="group"
        aria-label={translate('agents.manager.filter', 'Filter terminals')}
      >
        {filters.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={props.filter === value ? 'secondary' : 'ghost'}
            aria-pressed={props.filter === value}
            onClick={() => props.onFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Select value={props.project} onValueChange={props.onProject}>
        <SelectTrigger
          size="sm"
          className="max-w-48"
          aria-label={translate('agents.manager.project', 'Project')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {translate('agents.manager.allProjects', 'All projects')}
          </SelectItem>
          {props.projects.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={props.disabled}>
            {translate('agents.manager.select', 'Select…')}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => props.onSelect('orphan')}>
            {translate('agents.manager.selectOrphan', 'Orphan terminals in filter')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onSelect('independent')}>
            {translate('agents.manager.selectIndependent', 'Independent terminals in filter')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onSelect('all')}>
            {translate('agents.manager.selectAll', 'All terminals in filter')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => props.onSelect('none')}>
            {translate('agents.manager.clearSelection', 'Clear selection')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
