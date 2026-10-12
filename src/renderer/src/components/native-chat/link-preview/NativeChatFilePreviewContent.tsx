import { lazy, Suspense } from 'react'
import { FileQuestion } from 'lucide-react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { translate } from '@/i18n/i18n'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { nativeChatPreviewKind } from './native-chat-preview-kind'

const DocumentPreview = lazy(() => import('./NativeChatDocumentPreview'))
const DataPreview = lazy(() => import('./NativeChatDataPreview'))
const HtmlPreview = lazy(() => import('./NativeChatHtmlPreview'))
const ReportPreview = lazy(() => import('./NativeChatReportPreview'))
const ImageViewer = lazy(() => import('@/components/editor/ImageViewer'))
const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))

export type NativeChatFilePreviewContentProps = {
  filePath: string
  content: string
  encoding?: 'utf8' | 'base64'
  mimeType?: string
  line?: number | null
  runtimeContext?: RuntimeFileOperationArgs | null
}

const imageMimeTypes: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp'
}

function encodeUtf8Base64(content: string): string {
  const bytes = new TextEncoder().encode(content)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export default function NativeChatFilePreviewContent({
  filePath,
  content,
  encoding = 'utf8',
  mimeType,
  line
}: NativeChatFilePreviewContentProps): React.JSX.Element {
  const kind = nativeChatPreviewKind(filePath, mimeType)
  const extension = filePath.split(/[/\\]/).pop()?.toLowerCase().split('.').pop() ?? ''
  const fallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {translate('auto.components.nativeChat.preview.loadingFormat', 'Loading preview…')}
    </div>
  )

  if (kind === 'unsupported' || (encoding === 'base64' && kind !== 'image' && kind !== 'pdf')) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FileQuestion className="size-7" />
        <span>
          {translate(
            'auto.components.nativeChat.preview.unsupportedFormat',
            'Preview is unavailable for this file format'
          )}
        </span>
      </div>
    )
  }

  if (kind === 'code') {
    return (
      <div className="h-full min-h-0 overflow-hidden p-3">
        <NativeChatHighlightedCode
          content={content}
          filePath={filePath}
          startLine={1}
          targetLine={line}
          fillHeight
        />
      </div>
    )
  }

  return (
    <Suspense fallback={fallback}>
      {kind === 'image' ? (
        <div className="h-full min-h-0">
          <ImageViewer
            content={
              encoding === 'base64' ? content : extension === 'svg' ? encodeUtf8Base64(content) : ''
            }
            filePath={filePath}
            mimeType={
              mimeType?.startsWith('image/') ? mimeType : imageMimeTypes[extension] || 'image/png'
            }
          />
        </div>
      ) : null}
      {kind === 'pdf' ? (
        <div className="h-full min-h-0">
          {encoding === 'base64' ? (
            <PdfViewer content={content} filePath={filePath} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              {translate(
                'auto.components.nativeChat.preview.pdfUnavailable',
                'PDF preview is unavailable'
              )}
            </div>
          )}
        </div>
      ) : null}
      {kind === 'markdown' || kind === 'mermaid' ? (
        <DocumentPreview key={filePath} content={content} filePath={filePath} kind={kind} />
      ) : null}
      {kind === 'json' || kind === 'yaml' || kind === 'csv' ? (
        <DataPreview key={filePath} content={content} filePath={filePath} kind={kind} />
      ) : null}
      {kind === 'html' ? (
        <HtmlPreview key={filePath} content={content} filePath={filePath} />
      ) : null}
      {kind === 'report' ? (
        <ReportPreview key={filePath} content={content} filePath={filePath} />
      ) : null}
    </Suspense>
  )
}
