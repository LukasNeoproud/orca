/** Moves every other image surface to the same relative scroll position as `source`. */
export function syncImageSurfaceScroll(
  source: HTMLDivElement,
  surfaces: readonly (HTMLDivElement | null)[]
): void {
  const horizontal = source.scrollWidth - source.clientWidth
  const vertical = source.scrollHeight - source.clientHeight
  for (const other of surfaces) {
    if (!other || other === source) {
      continue
    }
    const nextLeft =
      horizontal > 0
        ? (source.scrollLeft / horizontal) * (other.scrollWidth - other.clientWidth)
        : 0
    const nextTop =
      vertical > 0 ? (source.scrollTop / vertical) * (other.scrollHeight - other.clientHeight) : 0
    // Why the threshold: the echo from the surface just moved must not start a scroll loop.
    if (Math.abs(other.scrollLeft - nextLeft) > 1) {
      other.scrollLeft = nextLeft
    }
    if (Math.abs(other.scrollTop - nextTop) > 1) {
      other.scrollTop = nextTop
    }
  }
}
