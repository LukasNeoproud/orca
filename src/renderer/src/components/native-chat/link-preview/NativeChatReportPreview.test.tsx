// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NativeChatReportPreview from './NativeChatReportPreview'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

afterEach(cleanup)

describe('test report preview', () => {
  it('summarizes recognized TAP results', () => {
    render(
      <NativeChatReportPreview
        filePath="results.tap"
        content={'TAP version 13\n1..2\nok 1 - opens\nnot ok 2 - saves'}
      />
    )
    expect(screen.getAllByText('1', { selector: 'strong' })).toHaveLength(2)
    expect(screen.getByText('not ok 2 - saves')).toBeTruthy()
  })

  it('falls back to raw content when no report format is recognized', () => {
    render(<NativeChatReportPreview filePath="test-report.txt" content="unrecognized output" />)
    expect(screen.getByText('unrecognized output')).toBeTruthy()
  })
})
