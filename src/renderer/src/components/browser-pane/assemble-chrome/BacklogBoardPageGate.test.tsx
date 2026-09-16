// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'

const mock = vi.hoisted(() => ({
  verified: false,
  listeners: new Set<() => void>(),
  acquire: vi.fn()
}))

vi.mock('@/lib/backlog-board-client', () => ({
  acquireBoundBacklogBoard: mock.acquire,
  getBacklogBoardError: () => null,
  isBacklogBoardVerified: () => mock.verified,
  subscribeBacklogBoardErrors: (listener: () => void) => {
    mock.listeners.add(listener)
    return () => {
      mock.listeners.delete(listener)
    }
  }
}))

import { BacklogBoardPageGate } from './BacklogBoardPageGate'

const page: BrowserPage = {
  id: 'board-page',
  workspaceId: 'browser-workspace',
  worktreeId: 'wt-1',
  url: 'about:blank',
  title: 'Backlog.md',
  loading: false,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false,
  loadError: null,
  createdAt: 1,
  backlogBoardBinding: {
    workspaceId: 'wt-1',
    executionHostId: 'runtime:viewer-a',
    runtimeEnvironmentId: 'viewer-a'
  }
}

describe('BacklogBoardPageGate', () => {
  beforeEach(() => {
    mock.verified = false
    mock.acquire.mockReset().mockReturnValue(new Promise(() => {}))
    mock.listeners.clear()
  })

  it('keeps an offscreen restored about:blank board hidden until its lease is verified', async () => {
    render(
      <BacklogBoardPageGate page={page}>
        <span>Board content</span>
      </BacklogBoardPageGate>
    )

    expect(screen.getByText('Connecting to Backlog.md…')).toBeTruthy()
    expect(screen.queryByText('Board content')).toBeNull()
    expect(mock.acquire).toHaveBeenCalledWith(page.backlogBoardBinding, page.id)

    await act(async () => {
      mock.verified = true
      for (const listener of mock.listeners) {
        listener()
      }
    })
    expect(screen.getByText('Board content')).toBeTruthy()
  })
})
