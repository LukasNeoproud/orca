import type { WebSocket } from 'ws'
import {
  createWsOutboundBackpressureQueue,
  type WsOutboundBackpressureQueue
} from '../../../shared/ws-outbound-backpressure-queue'
import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'
import {
  mobileE2EEBinaryPayloadAdmissionBytes,
  mobileE2EETextPayloadAdmissionBytes
} from './mobile-e2ee-outbound-admission'
import type {
  MobileE2EEOutboundMemoryBudget,
  MobileE2EEOutboundSocketMemory
} from './mobile-e2ee-outbound-memory-budget'
import { compressMobileE2EEPayload } from './mobile-e2ee-payload-compression'

export type DesktopMobileE2EEV2OutboundItem =
  | { kind: 'text'; plaintext: string }
  | { kind: 'binary'; plaintext: Uint8Array<ArrayBufferLike> }

export function desktopMobileE2EEV2OutboundItemBytes(
  item: DesktopMobileE2EEV2OutboundItem
): number {
  const bytes =
    item.kind === 'text'
      ? mobileE2EETextPayloadAdmissionBytes(item.plaintext)
      : mobileE2EEBinaryPayloadAdmissionBytes(item.plaintext)
  return Number.isFinite(bytes) ? bytes + 82 : bytes
}

export function createDesktopMobileE2EEV2OutboundQueue(args: {
  ws: WebSocket
  session: DesktopMobileE2EEV2Session
  onOverflow: () => void
  memoryBudget: MobileE2EEOutboundMemoryBudget
  socketMemory: MobileE2EEOutboundSocketMemory
  // Read per frame: the client advertises the capability after it authenticates.
  compressPayloads: () => boolean
}): WsOutboundBackpressureQueue<DesktopMobileE2EEV2OutboundItem> {
  return createWsOutboundBackpressureQueue<DesktopMobileE2EEV2OutboundItem>({
    // Why: sealing happens only after queue admission, so counters cannot be
    // consumed by an item rejected at the bounded queue boundary.
    send: (item) => {
      const compress = args.compressPayloads()
      if (item.kind === 'text') {
        args.ws.send(
          compress
            ? args.session.sealTextPayload(
                compressMobileE2EEPayload(new TextEncoder().encode(item.plaintext), 'text')
              )
            : args.session.sealText(item.plaintext)
        )
      } else {
        const payload = compress
          ? compressMobileE2EEPayload(item.plaintext, 'binary')
          : item.plaintext
        args.ws.send(Buffer.from(args.session.sealBinary(payload)), { binary: true })
      }
    },
    byteLengthOf: desktopMobileE2EEV2OutboundItemBytes,
    getBufferedAmount: () => args.ws.bufferedAmount,
    isWritable: () => args.ws.readyState === args.ws.OPEN,
    canSend: (bytes) => args.socketMemory.canSend(bytes),
    claimQueuedBytes: (bytes) => args.memoryBudget.claimQueuedBytes(bytes),
    onOverflow: args.onOverflow
  })
}
