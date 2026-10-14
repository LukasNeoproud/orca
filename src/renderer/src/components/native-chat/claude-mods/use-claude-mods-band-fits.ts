import { useEffect } from 'react'

/**
 * Marks the band's scroller `data-fits` while its content fits without scrolling. A band that fits
 * can show a hover card past its edge; one that scrolls has to clip it. Written straight to the
 * DOM: it follows layout, not React state.
 */
export function useClaudeModsBandFits(
  scroller: HTMLElement | null,
  content: HTMLElement | null
): void {
  useEffect(() => {
    if (!scroller || !content || typeof ResizeObserver === 'undefined') {
      return
    }
    // The content's own height, not scrollHeight: a revealed card would count as overflow.
    const measure = (): void => {
      scroller.dataset.fits = String(content.offsetHeight <= scroller.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [scroller, content])
}
