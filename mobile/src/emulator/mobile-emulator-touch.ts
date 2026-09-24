export type EmulatorPoint = { x: number; y: number }

export function mapEmulatorTouch(
  point: EmulatorPoint,
  layout: { width: number; height: number },
  image: { width: number; height: number },
  clamp = false
): EmulatorPoint | null {
  if (layout.width <= 0 || layout.height <= 0 || image.width <= 0 || image.height <= 0) {
    return null
  }
  const scale = Math.min(layout.width / image.width, layout.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const x = (point.x - (layout.width - width) / 2) / width
  const y = (point.y - (layout.height - height) / 2) / height
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) {
    return null
  }
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}
