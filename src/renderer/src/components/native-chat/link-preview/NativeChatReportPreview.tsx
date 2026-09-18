import { useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { NativeChatPreviewMode } from './NativeChatPreviewMode'

type ReportSummary = { tests: number; failures: number; skipped: number; failuresDetail: string[] }

function parseReport(content: string): ReportSummary | null {
  if (/^\s*<\?xml|^\s*<testsuites?\b/.test(content)) {
    const doc = new DOMParser().parseFromString(content, 'application/xml')
    if (doc.querySelector('parsererror')) {
      return null
    }
    const suites = Array.from(doc.querySelectorAll('testsuite'))
    if (!suites.length) {
      return null
    }
    const tests = suites.reduce((sum, node) => sum + Number(node.getAttribute('tests') || 0), 0)
    const failures = suites.reduce(
      (sum, node) =>
        sum + Number(node.getAttribute('failures') || 0) + Number(node.getAttribute('errors') || 0),
      0
    )
    const skipped = suites.reduce((sum, node) => sum + Number(node.getAttribute('skipped') || 0), 0)
    const failuresDetail = Array.from(doc.querySelectorAll('testcase'))
      .filter((node) => node.querySelector('failure, error'))
      .slice(0, 25)
      .map((node) =>
        `${node.getAttribute('classname') || ''} ${node.getAttribute('name') || ''}`.trim()
      )
    return { tests, failures, skipped, failuresDetail }
  }
  if (/^TAP version \d+/m.test(content) || /^\s*1\.\.\d+\s*$/m.test(content)) {
    const entries = content.match(/^\s*(?:not )?ok\b.*$/gm) ?? []
    if (!entries.length) {
      return null
    }
    const failedEntries = entries.filter((entry) => /^\s*not ok\b/.test(entry))
    const failuresDetail = failedEntries.slice(0, 25)
    return {
      tests: entries.length,
      failures: failedEntries.length,
      skipped: entries.filter((entry) => /#\s*SKIP\b/i.test(entry)).length,
      failuresDetail
    }
  }
  try {
    const value = JSON.parse(content) as Record<string, unknown>
    const counters =
      value.numTotalTests !== undefined
        ? value
        : (value.stats as Record<string, unknown> | undefined)
    if (!counters) {
      return null
    }
    const tests = Number(counters.numTotalTests ?? counters.tests)
    const failures = Number(counters.numFailedTests ?? counters.failures ?? 0)
    const skipped = Number(counters.numPendingTests ?? counters.skipped ?? 0)
    if (!Number.isFinite(tests) || !Number.isFinite(failures) || !Number.isFinite(skipped)) {
      return null
    }
    return { tests, failures, skipped, failuresDetail: [] }
  } catch {
    return null
  }
}

export default function NativeChatReportPreview({
  content,
  filePath
}: {
  content: string
  filePath: string
}): React.JSX.Element {
  const [source, setSource] = useState(false)
  const summary = useMemo(() => parseReport(content), [content])
  if (!summary) {
    return (
      <div className="h-full overflow-auto scrollbar-editor p-3">
        <NativeChatHighlightedCode content={content} filePath={filePath} />
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <NativeChatPreviewMode
        labels={[
          translate('auto.components.nativeChat.preview.summary', 'Summary'),
          translate('auto.components.nativeChat.preview.source', 'Source')
        ]}
        source={source}
        onChange={setSource}
      />
      <div className="min-h-0 flex-1 overflow-auto scrollbar-editor p-3">
        {source ? (
          <NativeChatHighlightedCode content={content} filePath={filePath} />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 p-3 tabular-nums">
              <span>
                <strong>{Math.max(0, summary.tests - summary.failures - summary.skipped)}</strong>{' '}
                {translate('auto.components.nativeChat.preview.passed', 'passed')}
              </span>
              <span>
                <strong>{summary.failures}</strong>{' '}
                {translate('auto.components.nativeChat.preview.failed', 'failed')}
              </span>
              <span>
                <strong>{summary.skipped}</strong>{' '}
                {translate('auto.components.nativeChat.preview.skipped', 'skipped')}
              </span>
            </div>
            {summary.failuresDetail.map((failure, index) => (
              <div
                key={`${failure}-${index}`}
                className="break-all border-l-2 border-destructive pl-2 font-mono text-xs"
              >
                {failure}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
