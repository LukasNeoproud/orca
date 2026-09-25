import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

describe('mobile approval terminal origin', () => {
  it('survives view unsubscription and clears on local input or phone disconnect', async () => {
    const runtime = new OrcaRuntimeService({} as never)
    runtime.setPtyController({
      listProcesses: vi.fn(async () => [
        { id: 'pty-a', rootProcessId: 101, cwd: '/tmp', title: 'shell' },
        { id: 'pty-b', rootProcessId: 202, cwd: '/tmp', title: 'shell' }
      ])
    } as never)
    runtime.recordMobileApprovalInput('pty-a', 'phone-a')
    runtime.recordMobileApprovalInput('pty-b', 'phone-b')
    expect(await runtime.getMobileApprovalTerminalRootPids('phone-a')).toEqual([101])
    expect(await runtime.getMobileApprovalTerminalRootPids('phone-b')).toEqual([202])
    runtime.recordMobileApprovalInput('pty-a', null)
    expect(await runtime.getMobileApprovalTerminalRootPids('phone-a')).toEqual([])
    runtime.clearMobileApprovalInputForClient('phone-b')
    expect(await runtime.getMobileApprovalTerminalRootPids('phone-b')).toEqual([])
  })

  it('expires stale mobile input before exposing a delayed Keychain request', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new OrcaRuntimeService({} as never)
      runtime.setPtyController({
        listProcesses: vi.fn(async () => [
          { id: 'pty-a', rootProcessId: 101, cwd: '/tmp', title: 'shell' }
        ])
      } as never)
      runtime.recordMobileApprovalInput('pty-a', 'phone-a')
      await vi.advanceTimersByTimeAsync(4 * 60 * 60_000 + 1)
      expect(await runtime.getMobileApprovalTerminalRootPids('phone-a')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
