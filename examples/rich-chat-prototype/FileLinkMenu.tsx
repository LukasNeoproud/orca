import { ExternalLink, Copy, GitCompareArrows, Plus, Eye } from 'lucide-react'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import type { FileActions } from './FileCard'
import type { PreviewFile } from './fixtures'
export function FileLinkMenu({
  file,
  actions,
  preview
}: {
  file: PreviewFile
  actions: FileActions
  preview?: () => void
}) {
  return (
    <DropdownMenuContent align="start" className="w-64">
      {preview ? (
        <DropdownMenuItem onSelect={preview}>
          <Eye />
          Zobrazit náhled
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => actions.open(file)}>
        <ExternalLink />
        {file.kind === 'web' ? 'Otevřít náhled webu' : 'Otevřít v záložce'}
      </DropdownMenuItem>
      {['code', 'image'].includes(file.kind) && !file.status ? (
        <DropdownMenuItem onSelect={() => actions.review(file)}>
          <GitCompareArrows />
          Zobrazit v Source Control
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => actions.attach(file)}>
        <Plus />
        Přidat odkaz do promptu
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={async () => {
          try {
            await navigator.clipboard.writeText(file.path)
            actions.notify('Cesta zkopírována')
          } catch {
            actions.notify('Kopírování není v tomto prohlížeči dostupné')
          }
        }}
      >
        <Copy />
        Kopírovat {file.kind === 'web' ? 'adresu' : 'cestu'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
