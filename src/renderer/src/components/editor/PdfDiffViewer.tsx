import type { JSX } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import ImageViewer from './ImageViewer'

export function PdfDiffViewer({
  originalContent,
  modifiedContent,
  filePath,
  sideBySide,
  layout
}: {
  originalContent: string
  modifiedContent: string
  filePath: string
  sideBySide: boolean
  layout: 'fill' | 'intrinsic'
}): JSX.Element {
  return (
    <div
      className={cn(
        'grid min-h-0 gap-3 p-3',
        layout === 'intrinsic' ? 'h-auto' : 'h-full',
        sideBySide ? 'grid-cols-2' : 'grid-cols-1'
      )}
    >
      {[
        {
          label: translate('auto.components.editor.ImageDiffViewer.57aac3979a', 'Original'),
          content: originalContent
        },
        {
          label: translate('auto.components.editor.ImageDiffViewer.a651be62b0', 'Modified'),
          content: modifiedContent
        }
      ].map(({ label, content }) => (
        <section
          key={label}
          className={cn(
            'flex min-h-0 flex-col overflow-hidden rounded-md bg-muted/10',
            layout === 'intrinsic' ? 'h-auto' : 'h-full'
          )}
        >
          <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground">
            {label}
          </div>
          {content ? (
            <div className={cn('min-h-0', layout === 'intrinsic' ? 'flex-none' : 'flex-1')}>
              <ImageViewer
                content={content}
                filePath={filePath}
                mimeType="application/pdf"
                layout={layout}
              />
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              {translate('auto.components.editor.ImageDiffViewer.fb0ae4f3c0', 'No preview')}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
