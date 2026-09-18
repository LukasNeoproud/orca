import { useState } from 'react'
import DOMPurify from 'dompurify'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { NativeChatPreviewMode } from './NativeChatPreviewMode'

const csp =
  "default-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'"

function isolatedHtml(content: string): string {
  const safeContent = DOMPurify.sanitize(content, {
    FORBID_TAGS: ['script', 'meta', 'base', 'link', 'iframe', 'object', 'embed', 'form']
  })
  return `<meta http-equiv="Content-Security-Policy" content="${csp}"><base href="about:blank">${safeContent}`
}

export default function NativeChatHtmlPreview({
  content,
  filePath
}: {
  content: string
  filePath: string
}): React.JSX.Element {
  const [source, setSource] = useState(false)
  const [started, setStarted] = useState(false)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <NativeChatPreviewMode
        labels={[
          translate('auto.components.nativeChat.preview.preview', 'Preview'),
          translate('auto.components.nativeChat.preview.source', 'Source')
        ]}
        source={source}
        onChange={setSource}
      />
      {source ? (
        <div className="min-h-0 flex-1 overflow-auto scrollbar-editor p-3">
          <NativeChatHighlightedCode content={content} filePath={filePath} />
        </div>
      ) : started ? (
        <iframe
          title={translate(
            'auto.components.nativeChat.preview.isolatedHtml',
            'Isolated HTML preview'
          )}
          sandbox=""
          referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 bg-background"
          srcDoc={isolatedHtml(content)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Globe className="size-7" />
          <p>
            {translate(
              'auto.components.nativeChat.preview.htmlOnDemand',
              'HTML preview loads on request'
            )}
          </p>
          <Button type="button" size="xs" variant="outline" onClick={() => setStarted(true)}>
            {translate('auto.components.nativeChat.preview.showHtml', 'Show preview')}
          </Button>
        </div>
      )}
    </div>
  )
}
