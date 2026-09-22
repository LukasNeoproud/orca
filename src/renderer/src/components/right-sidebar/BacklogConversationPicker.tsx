import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'

export function BacklogConversationPicker({
  value,
  choices,
  onChange
}: {
  value: string
  choices: { id: string; label: string }[]
  onChange: (id: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={translate('components.backlog.conversation', 'Conversation')}
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{choices.find((choice) => choice.id === value)?.label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder={translate(
              'components.backlog.searchConversations',
              'Search conversations…'
            )}
          />
          <CommandList>
            <CommandEmpty>
              {translate('components.backlog.noConversations', 'No conversations found.')}
            </CommandEmpty>
            {choices.map((choice) => (
              <CommandItem
                key={choice.id}
                value={choice.id}
                keywords={[choice.label]}
                onSelect={() => {
                  onChange(choice.id)
                  setOpen(false)
                }}
              >
                <Check className={value === choice.id ? 'size-4' : 'size-4 opacity-0'} />
                <span className="truncate">{choice.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
