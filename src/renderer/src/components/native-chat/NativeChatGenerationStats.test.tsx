// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatGenerationStats } from './NativeChatGenerationStats'

afterEach(cleanup)

describe('NativeChatGenerationStats', () => {
  it('leaves older host responses unchanged', () => {
    const { container } = render(<NativeChatGenerationStats />)
    expect(container).toBeEmptyDOMElement()
  })

  it('exposes the estimate, frozen model and mode with an accessible calculation', () => {
    render(
      <TooltipProvider>
        <NativeChatGenerationStats
          generation={{
            method: 'stream-estimate',
            model: 'response-model',
            serviceTier: 'priority',
            outputTokens: 100,
            generationDurationMs: 2_000
          }}
        />
      </TooltipProvider>
    )
    const stats = screen.getByText('response-model · Fast mode · ≈ 50 tok/s')
    expect(stats).toHaveAttribute('tabindex', '0')
    expect(stats.getAttribute('aria-label')).toContain(
      '100 output tokens (excluding reasoning) ÷ 2 s'
    )
  })

  it('shows unavailable instead of a rate for interrupted responses', () => {
    render(
      <TooltipProvider>
        <NativeChatGenerationStats
          generation={{
            method: 'stream-estimate',
            model: 'response-model',
            serviceTier: 'default',
            outputTokens: 100,
            generationDurationMs: 2_000,
            unavailableReason: 'interrupted'
          }}
        />
      </TooltipProvider>
    )
    expect(screen.getByText('response-model · Standard mode · tok/s unavailable')).toBeVisible()
    expect(screen.queryByText(/≈/)).toBeNull()
  })

  it('also labels other service tiers as modes', () => {
    render(
      <TooltipProvider>
        <NativeChatGenerationStats
          generation={{ method: 'stream-estimate', model: 'model', serviceTier: 'flex' }}
        />
      </TooltipProvider>
    )
    expect(screen.getByText('model · flex mode · tok/s unavailable')).toBeVisible()
  })
})
