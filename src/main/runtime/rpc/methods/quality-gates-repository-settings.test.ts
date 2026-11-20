import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import type { QualityGateRepositorySettings } from '../../../../shared/quality-gate-repository-settings'
import type { Repo } from '../../../../shared/repo-types'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RuntimeRepositorySettingsController } from '../../runtime-repository-settings-controller'
import type { RuntimeStore } from '../../runtime-store-contract'
import type { RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import type { RpcDispatchStreamingOptions } from '../dispatcher-stream-options'
import { ALL_RPC_METHODS } from './index'

const METHOD = 'qualityGates.setRepositorySettings'
const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const evil = { id: 'evil', name: 'Evil', command: 'echo pwned > pwned.txt', required: true }

// What each transport of a host stamps on a call.
const runtimeSocket = undefined
const hostWindow: RpcDispatchStreamingOptions = { caller: { kind: 'desktop' } }
const pairedApp: RpcDispatchStreamingOptions = {
  pairedDeviceId: 'desktop-1',
  clientKind: 'runtime',
  callerScope: { kind: 'runtime-paired', grants: [] }
}
const pairedPhone: RpcDispatchStreamingOptions = {
  pairedDeviceId: 'phone-1',
  clientKind: 'mobile',
  callerScope: { kind: 'mobile' }
}
const unnamedClient: RpcDispatchStreamingOptions = { clientKind: 'runtime' }

describe('qualityGates.setRepositorySettings', () => {
  let repoRow: Repo
  const storeUpdate = vi.fn()
  const notifyReposChanged = vi.fn()

  /** The runtime's own repository controller over a store that keeps one row. */
  function runtime(): OrcaRuntimeService {
    const store = {
      updateRepo: (id: string, updates: Partial<Repo>) => {
        storeUpdate(id, updates)
        repoRow = { ...repoRow, ...updates }
        return repoRow
      }
    }
    const controller = new RuntimeRepositorySettingsController({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: update() reads only updateRepo of the store.
      getStore: () => store as unknown as RuntimeStore,
      resolveRepo: async (selector) => {
        if (selector !== 'id:repo') {
          throw new Error('repo_not_found')
        }
        return repoRow
      },
      forgetTerminalTopology: () => {},
      invalidateResolvedWorktrees: () => {},
      invalidateWorktreeScan: () => {},
      notifyReposChanged
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method reads only showRepo and updateRepo.
    return {
      getRuntimeId: () => 'test-runtime',
      showRepo: (selector: string) => controller.show(selector),
      updateRepo: (selector: string, updates: Parameters<typeof controller.update>[1]) =>
        controller.update(selector, updates)
    } as unknown as OrcaRuntimeService
  }

  function call(
    params: unknown,
    transport: RpcDispatchStreamingOptions | undefined,
    methods = ALL_RPC_METHODS
  ): Promise<RpcResponse> {
    return new RpcDispatcher({ runtime: runtime(), methods }).dispatch(
      { id: 'req', authToken: 'token', method: METHOD, params },
      transport
    )
  }

  async function written(response: Promise<RpcResponse>): Promise<QualityGateRepositorySettings> {
    const settled = await response
    if (!settled.ok) {
      throw new Error(`${settled.error.code}: ${settled.error.message}`)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method returns the settings it stored.
    return settled.result as QualityGateRepositorySettings
  }

  beforeEach(() => {
    repoRow = { id: 'repo', path: '/srv/app', displayName: 'App', badgeColor: '#000', addedAt: 0 }
    storeUpdate.mockReset()
    notifyReposChanged.mockReset()
  })

  it('advertises its own capability, which a client checks before offering to edit', () => {
    expect(RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY)
  })

  it('stores what a paired Orca app sends in the row this host runs the gates from', async () => {
    const settings = await written(
      call(
        { repo: 'id:repo', gates: [lint], feedbackLoop: { enabled: true, maxRounds: 2 } },
        pairedApp
      )
    )
    expect(settings).toEqual({ gates: [lint], feedbackLoop: { enabled: true, maxRounds: 2 } })
    expect(storeUpdate).toHaveBeenCalledWith('repo', {
      qualityGates: [lint],
      qualityGateFeedbackLoop: { enabled: true, maxRounds: 2 }
    })
    // The host's own window and its other clients read the repositories again.
    expect(notifyReposChanged).toHaveBeenCalledTimes(1)
  })

  it("takes the same from the host's own window", async () => {
    const settings = await written(call({ repo: 'id:repo', gates: [lint] }, hostWindow))
    expect(settings.gates).toEqual([lint])
  })

  it.each([
    ['the runtime socket, which the CLI and agents call through', runtimeSocket],
    ['a client the transport could not name', unnamedClient]
  ])('refuses %s and writes nothing', async (_name, transport) => {
    const response = await call(
      { repo: 'id:repo', gates: [evil], feedbackLoop: { enabled: true } },
      transport
    )
    expect(response).toMatchObject({ ok: false })
    expect(response.ok ? '' : response.error.message).toContain('only in the Orca app')
    expect(storeUpdate).not.toHaveBeenCalled()
    expect(repoRow.qualityGates).toBeUndefined()
  })

  it('refuses a paired phone before the handler runs', async () => {
    const response = await call({ repo: 'id:repo', gates: [evil] }, pairedPhone)
    expect(response).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(storeUpdate).not.toHaveBeenCalled()
  })

  it('refuses a row this host only mirrors: its gates run from the row of the owning host', async () => {
    for (const elsewhere of [
      { executionHostId: 'runtime:other' as const },
      { connectionId: 'box' }
    ]) {
      repoRow = { ...repoRow, ...elsewhere }
      const response = await call({ repo: 'id:repo', gates: [lint] }, pairedApp)
      expect(response.ok ? '' : response.error.message).toContain('another host')
    }
    expect(storeUpdate).not.toHaveBeenCalled()
  })

  it('leaves a field that was not sent as the host has it', async () => {
    repoRow = {
      ...repoRow,
      qualityGates: [lint],
      qualityGateFeedbackLoop: { enabled: true, maxRounds: 4 }
    }
    const loopOnly = await written(
      call({ repo: 'id:repo', feedbackLoop: { enabled: false, maxRounds: 4 } }, pairedApp)
    )
    expect(loopOnly).toEqual({ gates: [lint], feedbackLoop: { enabled: false, maxRounds: 4 } })
    expect(storeUpdate).toHaveBeenLastCalledWith('repo', {
      qualityGateFeedbackLoop: { enabled: false, maxRounds: 4 }
    })

    const gatesOnly = await written(call({ repo: 'id:repo', gates: [] }, pairedApp))
    expect(gatesOnly).toEqual({ gates: [], feedbackLoop: { enabled: false, maxRounds: 4 } })
  })

  it('reads the fields with the normalizers of the settings, so a loose word turns nothing on', async () => {
    const settings = await written(
      call(
        {
          repo: 'id:repo',
          gates: [lint, { id: 'no command' }, { ...lint, name: 'Duplicate id' }],
          feedbackLoop: { enabled: 'yes', maxRounds: 99 }
        },
        pairedApp
      )
    )
    expect(settings).toEqual({ gates: [lint], feedbackLoop: { enabled: false, maxRounds: 10 } })
  })

  it('refuses a request that names no setting, a gate list that is no list, and an unknown repository', async () => {
    expect(await call({ repo: 'id:repo' }, pairedApp)).toMatchObject({ ok: false })
    expect(await call({ repo: 'id:repo', gates: 'pnpm lint' }, pairedApp)).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(await call({ repo: 'id:other', gates: [lint] }, pairedApp)).toMatchObject({ ok: false })
    expect(storeUpdate).not.toHaveBeenCalled()
  })

  it('is unknown to an older host, which a client reads as unsupported and not as saved', async () => {
    const olderHost = ALL_RPC_METHODS.filter((method) => method.name !== METHOD)
    expect(await call({ repo: 'id:repo', gates: [lint] }, pairedApp, olderHost)).toMatchObject({
      ok: false,
      error: { code: 'method_not_found' }
    })
  })
})
