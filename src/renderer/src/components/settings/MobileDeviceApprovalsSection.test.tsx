// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceApprovalEnrollmentStatus } from '../../../../shared/device-approval-enrollment-status'

const mocks = vi.hoisted(() => ({
  platform: 'darwin',
  isWebClient: false,
  getStatus: vi.fn<() => Promise<DeviceApprovalEnrollmentStatus>>(),
  start: vi.fn<() => Promise<DeviceApprovalEnrollmentStatus>>(),
  confirm:
    vi.fn<(_input: { fingerprintPrefix: string }) => Promise<DeviceApprovalEnrollmentStatus>>(),
  cancel: vi.fn<() => Promise<DeviceApprovalEnrollmentStatus>>()
}))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/renderer-app-platform', () => ({ getRendererAppPlatform: () => mocks.platform }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => mocks.isWebClient }))

import { MobileDeviceApprovalsSection } from './MobileDeviceApprovalsSection'

const fingerprint = 'A1B2C3D4E5F61234567890ABCDEF'

describe('MobileDeviceApprovalsSection', () => {
  beforeEach(() => {
    mocks.platform = 'darwin'
    mocks.isWebClient = false
    mocks.getStatus.mockReset().mockResolvedValue({ phase: 'idle' })
    mocks.start.mockReset().mockResolvedValue({ phase: 'waiting', expiresAt: Date.now() + 60_000 })
    mocks.confirm.mockReset().mockResolvedValue({ phase: 'complete' })
    mocks.cancel.mockReset().mockResolvedValue({ phase: 'idle' })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        mobile: {
          getDeviceApprovalEnrollmentStatus: mocks.getStatus,
          startDeviceApprovalEnrollment: mocks.start,
          confirmDeviceApprovalEnrollment: mocks.confirm,
          cancelDeviceApprovalEnrollment: mocks.cancel
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('only appears on macOS', () => {
    mocks.platform = 'linux'
    const { container } = render(<MobileDeviceApprovalsSection />)
    expect(container).toBeEmptyDOMElement()
    expect(mocks.getStatus).not.toHaveBeenCalled()
  })

  it('stays hidden in a Mac browser client', () => {
    mocks.isWebClient = true
    const { container } = render(<MobileDeviceApprovalsSection />)
    expect(container).toBeEmptyDOMElement()
    expect(mocks.getStatus).not.toHaveBeenCalled()
  })

  it('starts enrollment and explains the phone path', async () => {
    render(<MobileDeviceApprovalsSection />)
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Start registration' }))
    await waitFor(() => expect(screen.getByText('Waiting for your phone…')).toBeInTheDocument())
    expect(screen.getByText(/Settings → Device approvals/)).toBeInTheDocument()
    expect(screen.getByText(/shield icon in the host header is a shortcut/)).toBeInTheDocument()
    expect(screen.getByText(/Register this phone on the pending request/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce())
  })

  it('requires the matching 12-character prefix before confirmation', async () => {
    mocks.getStatus.mockResolvedValue({ phase: 'ready', fingerprint, securityLevel: 'strongbox' })
    render(<MobileDeviceApprovalsSection />)
    const input = await screen.findByLabelText('Phone fingerprint')
    expect(screen.getByLabelText('Full phone fingerprint')).toHaveTextContent(fingerprint)
    const confirm = screen.getByRole('button', { name: 'Confirm fingerprint' })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: '000000000000' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: fingerprint.slice(0, 12).toLowerCase() } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mocks.confirm).toHaveBeenCalledWith({
        fingerprintPrefix: fingerprint.slice(0, 12).toLowerCase()
      })
    )
    expect(await screen.findByText('Phone registered for device approvals.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registration/i })).not.toBeInTheDocument()
  })

  it('shows failure and a retry action', async () => {
    mocks.getStatus.mockResolvedValue({ phase: 'error', error: 'Touch ID was unavailable.' })
    render(<MobileDeviceApprovalsSection />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Touch ID was unavailable.')
    expect(screen.getByRole('button', { name: 'Try registration again' })).toBeEnabled()
  })

  it('shows the helper error when starting registration fails', async () => {
    mocks.start.mockRejectedValue(new Error('No paired phone is available'))
    render(<MobileDeviceApprovalsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Start registration' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No paired phone is available')
  })
})
