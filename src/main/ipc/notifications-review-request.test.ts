import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAllWindowsMock,
  getDispatchHandler,
  getNotificationEventHandler,
  getTrustedUIRendererWindowMock,
  notificationCtorMock,
  notificationOnMock,
  notificationRemoveListenerMock,
  resetNotificationDispatchMocks
} from './notifications-test-harness'

vi.mock('electron', async () =>
  (await import('./notifications-test-harness')).createElectronModuleMock()
)

vi.mock('./notification-authorization-status', async () =>
  (await import('./notifications-test-harness')).createNotificationAuthorizationModuleMock()
)

vi.mock('./ui', async () =>
  (await import('./notifications-test-harness')).createTrustedUIRendererModuleMock()
)

vi.mock('../tray/system-tray', async () =>
  (await import('./notifications-test-harness')).createSystemTrayModuleMock()
)

import { registerNotificationHandlers } from './notifications'
import type { NotificationDispatchRequest } from '../../shared/notification-settings-types'

function reviewRequest(key: string, shownInApp = true): NotificationDispatchRequest {
  return {
    source: 'review-request',
    shownInApp,
    notificationId: `review-request:${key}`,
    attentionKey: `review-request:${key}`,
    reviewRequest: {
      key,
      title: 'New pull request !7',
      body: 'Add paging · app · Ada',
      actionLabel: 'Review'
    }
  }
}

function register(
  notifications: { enabled: boolean; suppressWhenFocused: boolean },
  dispatchMobileNotification = vi.fn()
): ReturnType<typeof getDispatchHandler> {
  registerNotificationHandlers(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: dispatch reads only getSettings().notifications from the store.
    {
      getSettings: () => ({
        notifications: { agentTaskComplete: true, terminalBell: true, ...notifications }
      })
    } as never,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: dispatch calls only dispatchMobileNotification on the runtime.
    { dispatchMobileNotification } as never
  )
  return getDispatchHandler()
}

function makeWindow(focused: boolean): {
  window: Record<string, unknown>
  send: ReturnType<typeof vi.fn>
} {
  const send = vi.fn()
  return {
    send,
    window: {
      isDestroyed: () => false,
      isFocused: () => focused,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: { send }
    }
  }
}

function showFocusedWindow(): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the delivery policy reads only isDestroyed() and isFocused() from the window.
  getAllWindowsMock.mockReturnValue([makeWindow(true).window] as never)
}

beforeEach(() => {
  vi.stubEnv('ORCA_BACKGROUND_LAUNCH', undefined)
  vi.stubEnv('ORCA_E2E_HEADLESS', undefined)
  vi.stubEnv('ORCA_E2E_HEADFUL', undefined)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-28T16:00:00Z'))
  resetNotificationDispatchMocks()
})
afterEach(() => vi.unstubAllEnvs())

describe('review request notifications', () => {
  it('shows the sender wording with a button, and keeps the request off paired phones', async () => {
    const dispatchMobileNotification = vi.fn()
    const dispatch = register(
      { enabled: true, suppressWhenFocused: true },
      dispatchMobileNotification
    )

    expect(await dispatch({}, reviewRequest('org+repo+7'))).toEqual({ delivered: true })

    expect(notificationCtorMock).toHaveBeenCalledTimes(1)
    expect(notificationCtorMock.mock.calls[0]?.[0]).toMatchObject({
      title: 'New pull request !7',
      body: 'Add paging · app · Ada',
      actions: [{ type: 'button', text: 'Review' }]
    })
    expect(dispatchMobileNotification).not.toHaveBeenCalled()
  })

  it('opens the review in the main window from the banner and from its button', async () => {
    const { window, send } = makeWindow(false)
    getTrustedUIRendererWindowMock.mockReturnValue(window)
    const dispatch = register({ enabled: true, suppressWhenFocused: true })
    await dispatch({}, reviewRequest('org+repo+7'))

    const registered = notificationOnMock.mock.calls.map((call: unknown[]) => call[0])
    expect(registered).toContain('action')
    getNotificationEventHandler('click')()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('reviewRequest:open', { key: 'org+repo+7' })
    expect(notificationRemoveListenerMock).toHaveBeenCalledWith('action', expect.any(Function))
  })

  it('stays silent when notifications are turned off', async () => {
    const dispatch = register({ enabled: false, suppressWhenFocused: true })

    expect(await dispatch({}, reviewRequest('org+repo+7'))).toEqual({
      delivered: false,
      reason: 'disabled'
    })
    expect(notificationCtorMock).not.toHaveBeenCalled()
  })

  it('leaves a focused window to its in-app offer when suppress-while-focused is on', async () => {
    showFocusedWindow()

    const suppressing = register({ enabled: true, suppressWhenFocused: true })
    expect(await suppressing({}, reviewRequest('org+repo+7'))).toEqual({
      delivered: false,
      reason: 'suppressed-focus'
    })

    // Nothing in the app announces this one, so the banner is not redundant.
    expect(await suppressing({}, reviewRequest('org+repo+8', false))).toEqual({ delivered: true })

    resetNotificationDispatchMocks()
    showFocusedWindow()
    const always = register({ enabled: true, suppressWhenFocused: false })
    expect(await always({}, reviewRequest('org+repo+7'))).toEqual({ delivered: true })
  })

  it('announces two requests found together, but never the same one twice in a burst', async () => {
    const dispatch = register({ enabled: true, suppressWhenFocused: true })

    expect(await dispatch({}, reviewRequest('org+repo+7'))).toEqual({ delivered: true })
    expect(await dispatch({}, reviewRequest('org+repo+8'))).toEqual({ delivered: true })
    expect(await dispatch({}, reviewRequest('org+repo+7'))).toEqual({
      delivered: false,
      reason: 'cooldown'
    })
    expect(notificationCtorMock).toHaveBeenCalledTimes(2)
  })
})
