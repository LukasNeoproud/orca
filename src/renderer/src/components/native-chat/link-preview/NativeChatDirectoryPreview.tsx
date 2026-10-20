import { File, Folder, FolderOpen } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { DirEntry } from '../../../../../shared/filesystem-entry-types'

/** A folder link's listing: folders first, capped, with the count it leaves out. */
export function NativeChatDirectoryPreview({
  entries,
  entryCount
}: {
  entries: readonly DirEntry[]
  entryCount: number
}): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <FolderOpen className="size-7" />
        <span>
          {translate('auto.components.nativeChat.preview.emptyFolder', 'This folder is empty.')}
        </span>
      </div>
    )
  }
  const hidden = entryCount - entries.length
  return (
    <ul
      className="space-y-0.5 text-sm"
      aria-label={translate('auto.components.nativeChat.preview.folderContents', 'Folder contents')}
    >
      {entries.map((entry) => (
        <li key={entry.name} className="flex min-w-0 items-center gap-2">
          {entry.isDirectory ? (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <File className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-mono text-xs" title={entry.name}>
            {entry.name}
            {entry.isDirectory ? '/' : ''}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li className="pt-1 text-xs text-muted-foreground">
          {translate(
            'auto.components.nativeChat.preview.moreFolderEntries',
            '…and {{value0}} more',
            {
              value0: hidden
            }
          )}
        </li>
      )}
    </ul>
  )
}
