import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { deviceApproval } from '@orca/expo-device-approval'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { Buffer } from 'buffer'
import { z } from 'zod'
import { parseDeviceApprovalPayload } from '../../../src/shared/device-approval-contract'
import type { RpcClient } from '../transport/rpc-client'

const ListResult = z.object({
  supported: z.boolean(),
  pending: z.array(z.object({ payload: z.string().max(16_384) })).max(32)
})
const fingerprint = (spki: string) => bytesToHex(sha256(Buffer.from(spki, 'base64')))
export type PendingApproval = {
  payload: string
  request: ReturnType<typeof parseDeviceApprovalPayload>
}

export function useDeviceApprovals(client: RpcClient | null, hostId: string, connected: boolean) {
  const [pending, setPending] = useState<PendingApproval[]>([])
  const [keyId, setKeyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const generation = useRef(0)

  useFocusEffect(
    useCallback(() => {
      const owner = ++generation.current
      setKeyId(null)
      setSupported(false)
      setNotice(null)
      setRefreshError(null)
      let loading = false
      const refresh = async () => {
        if (loading || !client || !connected || AppState.currentState !== 'active') {
          return
        }
        loading = true
        try {
          const result = await client.sendRequest(
            'deviceApproval.list',
            {},
            { timeoutMs: 5_000, failWhenDisconnected: true }
          )
          if (owner !== generation.current) {
            return
          }
          if (!result.ok) {
            throw new Error(result.error.message)
          }
          const value = ListResult.parse(result.result)
          setSupported(value.supported)
          setPending(
            value.pending.flatMap(({ payload }) => {
              try {
                return [{ payload, request: parseDeviceApprovalPayload(payload) }]
              } catch {
                return []
              }
            })
          )
          setRefreshError(null)
        } catch (cause) {
          if (owner === generation.current) {
            setPending([])
            setRefreshError(
              cause instanceof Error ? cause.message : 'Could not read pending requests'
            )
          }
        } finally {
          loading = false
        }
      }
      void deviceApproval
        .getPublicInfo(hostId)
        .then((info) => {
          if (owner === generation.current) {
            setKeyId(fingerprint(info.publicKeySpkiBase64))
          }
        })
        .catch(() => {
          if (owner === generation.current) {
            setKeyId(null)
          }
        })
      void refresh()
      const timer = setInterval(() => void refresh(), 2_000)
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refresh()
        } else {
          setPending([])
        }
      })
      return () => {
        generation.current++
        clearInterval(timer)
        listener.remove()
        setPending([])
      }
    }, [client, connected, hostId])
  )

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device approval failed')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const approve = useCallback(
    (entry: PendingApproval) =>
      perform(async () => {
        if (!client || client.getState() !== 'connected') {
          throw new Error('Reconnect to this Mac first')
        }
        const owner = generation.current
        const request = parseDeviceApprovalPayload(entry.payload)
        let result
        if ('kind' in request) {
          const enrollment = await deviceApproval.enroll(hostId, request.challengeBase64)
          setKeyId(fingerprint(enrollment.publicKeySpkiBase64))
          if (owner !== generation.current || client.getState() !== 'connected') {
            throw new Error('Connection changed; start enrollment again')
          }
          parseDeviceApprovalPayload(entry.payload)
          result = await client.sendRequest(
            'deviceApproval.enroll',
            {
              version: 1,
              requestId: request.requestId,
              publicKeySpkiBase64: enrollment.publicKeySpkiBase64,
              attestationCertificateChainBase64: enrollment.attestationCertificateChainBase64
            },
            { failWhenDisconnected: true, timeoutMs: 10_000 }
          )
          if (!result.ok) {
            throw new Error(result.error.message)
          }
          setNotice(
            'Key sent. Compare its fingerprint on the Mac and complete local Touch ID enrollment.'
          )
        } else {
          const info = await deviceApproval.getPublicInfo(hostId)
          if (owner !== generation.current || client.getState() !== 'connected') {
            throw new Error('Connection changed; approval was not started')
          }
          if (fingerprint(info.publicKeySpkiBase64) !== request.keyId) {
            throw new Error('This phone is not the registered approver')
          }
          const signature = await deviceApproval.sign(hostId, entry.payload)
          if (owner !== generation.current || client.getState() !== 'connected') {
            throw new Error('Connection changed; approval was not sent')
          }
          parseDeviceApprovalPayload(entry.payload)
          result = await client.sendRequest(
            'deviceApproval.respond',
            {
              version: 1,
              requestId: request.requestId,
              signatureDerBase64: signature.signatureDerBase64
            },
            { failWhenDisconnected: true, timeoutMs: 10_000 }
          )
          if (!result.ok) {
            throw new Error(result.error.message)
          }
          setNotice('Signature submitted. The Mac helper verifies it before releasing credentials.')
        }
        setPending((previous) =>
          previous.filter((item) => item.request.requestId !== request.requestId)
        )
      }),
    [client, hostId, perform]
  )

  const resetKey = useCallback(
    () =>
      perform(async () => {
        await deviceApproval.deleteKey(hostId)
        setKeyId(null)
        setNotice(
          'Local approval key removed. Register this phone again on the Mac before approving requests.'
        )
      }),
    [hostId, perform]
  )
  return {
    pending,
    keyId,
    error: error ?? refreshError,
    notice,
    supported,
    busy,
    approve,
    resetKey
  }
}
