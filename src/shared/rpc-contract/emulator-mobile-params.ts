import { z } from 'zod'

const Coordinate = z.number().finite().min(0).max(1)
const SubscriptionId = z.string().min(1)
const Touch = z.object({
  type: z.literal('touch'),
  phase: z.enum(['down', 'move', 'up', 'cancel']),
  x: Coordinate,
  y: Coordinate,
  videoWidth: z.number().int().min(1).max(16_384).optional(),
  videoHeight: z.number().int().min(1).max(16_384).optional()
})
const GesturePoint = z.object({
  type: z.enum(['begin', 'move', 'end']),
  x: Coordinate,
  y: Coordinate,
  edge: z.number().int().min(0).max(4).optional()
})
const Action = z.discriminatedUnion('type', [
  Touch,
  z.object({ type: z.literal('tap'), x: Coordinate, y: Coordinate }),
  z.object({ type: z.literal('gesture'), points: z.array(GesturePoint).min(2).max(64) }),
  z.object({ type: z.literal('type'), text: z.string().max(10_000) }),
  z.object({ type: z.literal('button'), name: z.string().min(1).max(64) })
])

export const EmulatorMobileDevicesParams = z.object({})

export const EmulatorMobileStreamParams = z.object({
  deviceId: z.string().min(1),
  profile: z.enum(['quality', 'responsive', 'data-saver']).default('responsive'),
  videoCodecs: z
    .array(z.enum(['h264', 'hevc', 'av1', 'jpeg']))
    .min(1)
    .max(4)
    .optional()
})

export const EmulatorMobileUnsubscribeParams = z.object({ subscriptionId: SubscriptionId })

export const EmulatorMobileInputParams = z.object({
  subscriptionId: SubscriptionId,
  action: Action
})
