import { describe, expect, it, vi } from 'vitest'
import {
  mobileContextualPreviewSignature,
  resolveMobileContextualFilePreview
} from './mobile-contextual-file-preview'

function ok(result: unknown) {
  return { id: '1', ok: true as const, result, _meta: { runtimeId: 'runtime-1' } }
}

describe('resolveMobileContextualFilePreview', () => {
  it('resolves a worktree file on the selected execution host', async () => {
    const sendRequest = vi.fn(async () =>
      ok({
        worktree: 'wt-2',
        exists: true,
        isDirectory: false,
        openTarget: {
          kind: 'worktree-file',
          provider: 'ssh',
          relativePath: 'src/app.ts',
          absolutePath: '/remote/repo/src/app.ts'
        }
      })
    )

    await expect(
      resolveMobileContextualFilePreview({ sendRequest }, 'wt-1', {
        pathText: 'src/app.ts:12:3',
        line: null,
        column: null,
        nativeChatContext: { tabId: 'tab-1', sessionId: 'session-1' }
      })
    ).resolves.toEqual({
      status: 'resolved',
      source: { source: 'worktree', worktreeId: 'wt-2', relativePath: 'src/app.ts' },
      displayPath: 'src/app.ts',
      line: 12,
      outsideWorkspace: false
    })
    expect(sendRequest).toHaveBeenCalledWith(
      'files.resolveTerminalPath',
      {
        worktree: 'id:wt-1',
        pathText: 'src/app.ts',
        crossWorkspace: true,
        nativeChatContext: { tabId: 'tab-1', sessionId: 'session-1' }
      },
      { timeoutMs: 10_000 }
    )
  })

  it('returns a consent-gated grant source for a file outside the workspace', async () => {
    const sendRequest = vi.fn(async () =>
      ok({
        worktree: 'wt-1',
        exists: true,
        isDirectory: false,
        openTarget: {
          kind: 'absolute-file',
          provider: 'ssh',
          absolutePath: '/tmp/report.html',
          grantId: 'grant-1',
          readOnly: true
        }
      })
    )

    await expect(
      resolveMobileContextualFilePreview({ sendRequest }, 'wt-1', {
        pathText: '../report.html',
        line: null,
        column: null,
        terminalHandle: 'terminal-1',
        cwd: '/remote/repo/sub'
      })
    ).resolves.toEqual({
      status: 'resolved',
      source: {
        source: 'terminalArtifact',
        worktreeId: 'wt-1',
        absolutePath: '/tmp/report.html',
        grantId: 'grant-1',
        pathText: '../report.html',
        terminalHandle: 'terminal-1',
        cwd: '/remote/repo/sub',
        readOnly: true
      },
      displayPath: '/tmp/report.html',
      line: null,
      outsideWorkspace: true
    })
  })

  it('maps host misses without trying any local path', async () => {
    const sendRequest = vi.fn(async () => ok({ exists: false, isDirectory: false }))

    await expect(
      resolveMobileContextualFilePreview({ sendRequest }, 'wt-1', {
        pathText: '/same/local/path.ts',
        line: null,
        column: null
      })
    ).resolves.toEqual({
      status: 'error',
      preview: { status: 'error', message: 'File not found', reconnect: false }
    })
    expect(sendRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps an unavailable remote host as an error without local fallback', async () => {
    const sendRequest = vi.fn(async () => ({
      id: '1',
      ok: false as const,
      error: { code: 'provider_unavailable', message: 'Remote connection dropped' }
    }))

    await expect(
      resolveMobileContextualFilePreview({ sendRequest }, 'wt-1', {
        pathText: '/remote/repo/src/app.ts',
        line: null,
        column: null,
        terminalHandle: 'terminal-1'
      })
    ).resolves.toEqual({
      status: 'error',
      preview: {
        status: 'error',
        message: 'Unable to reach the desktop filesystem',
        reconnect: true
      }
    })
    expect(sendRequest).toHaveBeenCalledTimes(1)
  })
})

describe('mobileContextualPreviewSignature', () => {
  it('changes with current text content while ignoring transient states', () => {
    const first = mobileContextualPreviewSignature({
      status: 'ready',
      kind: 'text',
      content: 'one',
      truncated: false,
      byteLength: 3
    })
    const second = mobileContextualPreviewSignature({
      status: 'ready',
      kind: 'text',
      content: 'two',
      truncated: false,
      byteLength: 3
    })

    expect(first).not.toBe(second)
    expect(mobileContextualPreviewSignature({ status: 'loading', message: 'Loading' })).toBeNull()
  })

  it('detects a file growing beyond an unchanged truncated prefix', () => {
    const first = mobileContextualPreviewSignature({
      status: 'ready',
      kind: 'text',
      content: 'same bounded prefix',
      truncated: true,
      byteLength: 600_000
    })
    const grown = mobileContextualPreviewSignature({
      status: 'ready',
      kind: 'text',
      content: 'same bounded prefix',
      truncated: true,
      byteLength: 700_000
    })

    expect(first).not.toBe(grown)
  })
})
