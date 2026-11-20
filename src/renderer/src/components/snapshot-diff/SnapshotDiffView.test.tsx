// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tabs, TabsList } from '@/components/ui/tabs'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewFileDiff
} from '../../../../shared/azure-devops-review-types'
import type { SnapshotDiffEntry, SnapshotDiffImages } from './snapshot-diff-entries'
import type { SnapshotDiffState } from './use-snapshot-diff'

const mocks = vi.hoisted(
  (): { diff: { current: unknown }; getFileDiff: ReturnType<typeof vi.fn> } => ({
    diff: { current: null },
    getFileDiff: vi.fn()
  })
)

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''))
}))
vi.mock('@/hooks/use-document-dark-theme', () => ({ useDocumentDarkTheme: () => false }))
vi.mock('@/lib/azure-devops-review-client', () => ({
  getAzureDevOpsReviewFileDiff: mocks.getFileDiff
}))
vi.mock('./use-snapshot-diff', () => ({ useSnapshotDiff: () => mocks.diff.current }))
vi.mock('@/components/editor/ImageDiffPane', () => ({
  ImageDiffPane: (props: {
    label: string
    content: string
    region: unknown
    overlay?: ReactNode
  }) => (
    <div
      data-testid={`pane-${props.label}`}
      data-content={props.content}
      data-region={props.region ? JSON.stringify(props.region) : ''}
    >
      {props.overlay}
    </div>
  )
}))

import {
  AzureDevOpsSnapshotsTabContent,
  AzureDevOpsSnapshotsTabTrigger
} from './AzureDevOpsSnapshotsTab'
import { SnapshotDiffView } from './SnapshotDiffView'

const PAYMENT: SnapshotDiffEntry = {
  key: 'payment',
  path: 'app/src/test/snapshots/images/com.example_PaymentTest_default.png',
  status: 'modified',
  framework: 'paparazzi'
}
const CART: SnapshotDiffEntry = {
  key: 'cart',
  path: 'ShopTests/__Snapshots__/CartTests/testCart.1.png',
  status: 'added',
  framework: 'swift-snapshot-testing'
}
const IMAGES: SnapshotDiffImages = {
  originalContent: 'BEFORE',
  modifiedContent: 'AFTER',
  mimeType: 'image/png'
}
const READY: SnapshotDiffState = {
  kind: 'ready',
  result: {
    kind: 'ready',
    width: 1000,
    height: 2000,
    changedPixels: 30_000,
    regions: [
      { x: 100, y: 200, width: 300, height: 50, changedPixels: 10_000 },
      { x: 100, y: 900, width: 400, height: 80, changedPixels: 20_000 }
    ],
    highlightContent: 'HIGHLIGHT',
    plainContent: 'PLAIN'
  }
}

function renderView(
  entries: SnapshotDiffEntry[],
  loadImages = vi.fn(async (): Promise<SnapshotDiffImages | null> => IMAGES)
): typeof loadImages {
  render(
    <SnapshotDiffView
      entries={entries}
      loadImages={loadImages}
      revisionKey="rev-1"
      scopeLabel="compared with main"
    />
  )
  return loadImages
}

afterEach(cleanup)
beforeEach(() => {
  mocks.diff.current = READY
  mocks.getFileDiff.mockReset()
})

describe('SnapshotDiffView', () => {
  it('lists the changed snapshots and opens the first one as before, after and difference', async () => {
    const loadImages = renderView([PAYMENT, CART])

    const rows = screen.getAllByTestId('snapshot-diff-entry')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Mcom.example_PaymentTest_default.pngPaparazzi · app/src/test/snapshots/images',
      'AtestCart.1.pngswift-snapshot-testing · ShopTests/__Snapshots__/CartTests'
    ])
    expect(rows[0].getAttribute('data-current')).toBe('true')
    expect(screen.getByText('Changed snapshot images: 2 · compared with main')).toBeTruthy()

    await waitFor(() => expect(screen.getByTestId('pane-Before')).toBeTruthy())
    expect(loadImages).toHaveBeenCalledWith(PAYMENT)
    expect(screen.getByTestId('pane-Before').getAttribute('data-content')).toBe('BEFORE')
    expect(screen.getByTestId('pane-After').getAttribute('data-content')).toBe('AFTER')
    expect(screen.getByTestId('pane-Difference').getAttribute('data-content')).toBe('HIGHLIGHT')
    expect(screen.getByTestId('snapshot-diff-summary').textContent).toBe(
      'Changed pixels: 1.5 % · Change areas: 2'
    )
  })

  it('outlines and numbers the change areas, and hides them with highlighting off', async () => {
    renderView([PAYMENT])
    await waitFor(() => expect(screen.getByTestId('pane-Difference')).toBeTruthy())

    const frames = (): Element[] =>
      Array.from(screen.getByTestId('pane-Difference').querySelectorAll('[data-snapshot-region]'))
    expect(frames().map((frame) => frame.textContent)).toEqual(['1', '2'])

    const toggle = screen.getByRole('button', { name: 'Highlight changes' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(frames()).toEqual([])
    expect(screen.getByTestId('pane-Difference').getAttribute('data-content')).toBe('PLAIN')
  })

  it('explains the removed and added colors while changes are highlighted', async () => {
    renderView([PAYMENT])
    await waitFor(() => expect(screen.getByTestId('pane-Difference')).toBeTruthy())

    const legend = screen.getByRole('list', { name: 'Difference colors' })
    expect(Array.from(legend.querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Removed (before)',
      'Added or changed (after)'
    ])
    expect(
      Array.from(legend.querySelectorAll('span[aria-hidden]')).map((swatch) => swatch.className)
    ).toEqual([
      expect.stringContaining('var(--git-decoration-deleted)'),
      expect.stringContaining('var(--git-decoration-added)')
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Highlight changes' }))
    expect(screen.queryByTestId('snapshot-diff-legend')).toBeNull()
  })

  it('blends the after image over the before image and keeps the blend between snapshots', async () => {
    renderView([PAYMENT, { ...CART, status: 'modified' }])
    await waitFor(() => expect(screen.getByTestId('pane-Difference')).toBeTruthy())

    const blend = screen.getByRole('button', { name: 'Blend' })
    fireEvent.click(blend)
    expect(blend.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('pane-Difference')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Highlight changes' })).toBeNull()
    expect(screen.queryByTestId('snapshot-diff-legend')).toBeNull()

    const pane = screen.getByTestId('pane-Blend')
    expect(pane.getAttribute('data-content')).toBe('BEFORE')
    const after = (): HTMLImageElement | null =>
      pane.ownerDocument.querySelector('[data-testid="snapshot-blend-after"]')
    expect(after()?.getAttribute('src')).toBe('data:image/png;base64,AFTER')
    expect(after()?.style.opacity).toBe('0.5')

    const slider = screen.getByRole('slider', { name: 'Share of the after image' })
    expect(slider.getAttribute('aria-valuetext')).toBe('50 % after')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(after()?.style.opacity).toBe('1')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(after()?.style.opacity).toBe('0')

    fireEvent.click(screen.getAllByTestId('snapshot-diff-entry')[1])
    await waitFor(() => expect(screen.getByTestId('pane-Blend')).toBeTruthy())
    expect(after()?.style.opacity).toBe('0')

    fireEvent.click(screen.getByRole('button', { name: 'Difference' }))
    expect(screen.getByTestId('pane-Difference')).toBeTruthy()
  })

  it('offers a blend above the comparison limit, and none for a snapshot with one side', async () => {
    mocks.diff.current = { kind: 'too-large', width: 4000, height: 2100 }
    renderView([PAYMENT, CART])
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Blend' }))
    expect(screen.getByTestId('pane-Blend')).toBeTruthy()

    mocks.diff.current = { kind: 'one-sided', side: 'added' }
    fireEvent.click(screen.getAllByTestId('snapshot-diff-entry')[1])
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('New snapshot'))
    expect(screen.queryByRole('button', { name: 'Blend' })).toBeNull()
    expect(screen.queryByTestId('pane-Blend')).toBeNull()
  })

  it('jumps to a change area from the list and marks it in every pane', async () => {
    renderView([PAYMENT])
    await waitFor(() => expect(screen.getByTestId('pane-Difference')).toBeTruthy())
    expect(screen.getByTestId('pane-After').getAttribute('data-region')).toBe('')

    const second = screen.getByRole('button', { name: 'Go to change area 2' })
    expect(second.textContent).toBe('2400 × 80 px')
    fireEvent.click(second)

    expect(second.getAttribute('aria-pressed')).toBe('true')
    const current = screen
      .getByTestId('pane-Difference')
      .querySelector('[data-snapshot-region][data-current="true"]')
    expect(current?.getAttribute('data-snapshot-region')).toBe('2')
    // No readable header on the stub images, so both sides fall back to the comparison size.
    const frame: Record<string, number> = JSON.parse(
      screen.getByTestId('pane-After').getAttribute('data-region') ?? '{}'
    )
    expect(Object.entries(frame).map(([side, value]) => [side, Number(value.toFixed(2))])).toEqual([
      ['x', 9.7],
      ['y', 44.85],
      ['width', 40.6],
      ['height', 4.3]
    ])
    expect(screen.getByTestId('pane-Before').getAttribute('data-region')).toBe(
      screen.getByTestId('pane-After').getAttribute('data-region')
    )
  })

  it('says why there is no difference for an oversized image and for a new snapshot', async () => {
    mocks.diff.current = { kind: 'too-large', width: 4000, height: 2100 }
    renderView([PAYMENT, CART])
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe(
      'The difference is not computed: 4000 × 2100 px is above the limit of 8 megapixels.'
    )
    expect(screen.queryByTestId('pane-Difference')).toBeNull()
    expect(screen.queryByText('Change areas')).toBeNull()

    mocks.diff.current = { kind: 'one-sided', side: 'added' }
    fireEvent.click(screen.getAllByTestId('snapshot-diff-entry')[1])
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'New snapshot: there is no earlier image to compare with.'
      )
    )
  })

  it('reloads on selection, and keeps an image of a fixed revision once loaded', async () => {
    const loadImages = renderView([PAYMENT, CART])
    await waitFor(() => expect(loadImages).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('pane-Before')).toBeTruthy())

    fireEvent.click(screen.getAllByTestId('snapshot-diff-entry')[1])
    await waitFor(() => expect(loadImages).toHaveBeenLastCalledWith(CART))
    await waitFor(() => expect(screen.getByTestId('pane-Before')).toBeTruthy())

    fireEvent.click(screen.getAllByTestId('snapshot-diff-entry')[0])
    await waitFor(() => expect(screen.getByTestId('pane-Before')).toBeTruthy())
    expect(loadImages).toHaveBeenCalledTimes(2)
  })

  it('reports a failed load with a retry, and a file without an image preview', async () => {
    const loadImages = vi
      .fn<() => Promise<SnapshotDiffImages | null>>()
      .mockRejectedValueOnce(new Error('Diff did not finish loading.'))
      .mockResolvedValueOnce(null)
    renderView([PAYMENT], loadImages)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Diff did not finish loading.')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('This file has no image preview.')).toBeTruthy())
  })

  it('explains an empty list instead of showing empty panes', () => {
    const loadImages = renderView([])
    expect(screen.getByText('No snapshot test images changed in this diff.')).toBeTruthy()
    expect(screen.queryByTestId('snapshot-diff-entry')).toBeNull()
    expect(loadImages).not.toHaveBeenCalled()
  })
})

describe('Azure DevOps pull request Snapshots tab', () => {
  const imageSide = (content: string): AzureDevOpsReviewFileDiff['original'] => ({
    content,
    missing: false,
    binary: true,
    tooLarge: false,
    imageMimeType: 'image/png'
  })

  function renderTab(paths: string[]): void {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tab reads only the pull request key, the iteration id and the changes set here.
    const detail = {
      pullRequest: { key: 'org+project+repo+42' },
      latestIteration: { id: 3 },
      changes: paths.map((path) => ({
        path,
        originalPath: null,
        changeType: 'edit',
        changeTrackingId: null
      }))
    } as AzureDevOpsReviewDetail
    render(
      <Tabs defaultValue="snapshots">
        <TabsList>
          <AzureDevOpsSnapshotsTabTrigger detail={detail} />
        </TabsList>
        <AzureDevOpsSnapshotsTabContent detail={detail} />
      </Tabs>
    )
  }

  it('offers the tab with the snapshot count and loads images from the pull request diff', async () => {
    mocks.getFileDiff.mockResolvedValue({
      iterationId: 3,
      original: imageSide('PR-BEFORE'),
      modified: imageSide('PR-AFTER')
    })
    renderTab(['Shop/PaymentView.swift', PAYMENT.path, CART.path])

    expect(screen.getByRole('tab', { name: 'Snapshots (2)' })).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('pane-Before')).toBeTruthy())
    expect(mocks.getFileDiff).toHaveBeenCalledWith({
      pullRequestKey: 'org+project+repo+42',
      path: PAYMENT.path,
      originalPath: null
    })
    expect(screen.getByTestId('pane-Before').getAttribute('data-content')).toBe('PR-BEFORE')
    expect(screen.getByTestId('pane-After').getAttribute('data-content')).toBe('PR-AFTER')
    expect(screen.getByText('Changed snapshot images: 2 · in this pull request')).toBeTruthy()
  })

  it('has no tab while the pull request changes no snapshot image', () => {
    renderTab(['Shop/PaymentView.swift', 'docs/home.png'])
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
