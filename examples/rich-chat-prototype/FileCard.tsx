import { FileLinkMenu } from './FileLinkMenu'
import { Code2, FileText, Image, Globe, ChevronDown, File, Clock3 } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PreviewContent } from './PreviewContent'
import type { PreviewFile } from './fixtures'

export type FileActions = {
  open: (file: PreviewFile) => void
  review: (file: PreviewFile) => void
  attach: (file: PreviewFile) => void
  notify: (message: string) => void
}
export function FileCard({
  file,
  actions,
  updated = false,
  compact = false
}: {
  file: PreviewFile
  actions: FileActions
  updated?: boolean
  compact?: boolean
}) {
  const Icon =
    file.kind === 'image'
      ? Image
      : file.kind === 'web'
        ? Globe
        : file.kind === 'code'
          ? Code2
          : file.kind === 'binary'
            ? File
            : FileText
  const menu = <FileLinkMenu file={file} actions={actions} />
  return (
    <article className={`file-card ${compact ? 'compact-card' : ''}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="file-heading" aria-label={`Akce odkazu ${file.name}`}>
            <Icon size={16} />
            <span>{file.name}</span>
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
      {!compact ? (
        file.kind === 'image' && !file.status ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="image-menu-trigger" aria-label={`Akce náhledu ${file.name}`}>
                <PreviewContent file={file} updated={updated} />
              </button>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
        ) : (
          <PreviewContent file={file} updated={updated} />
        )
      ) : null}
      <div className="file-caption">
        <span>{file.meta}</span>
        {(updated && !file.status && ['image', 'code'].includes(file.kind)) ||
        file.status === 'changed' ? (
          <span className="changed-label">
            <Clock3 size={12} /> Změněno od náhledu
          </span>
        ) : null}
      </div>
      <div className="file-path" title={file.path}>
        {file.path}
      </div>
    </article>
  )
}
