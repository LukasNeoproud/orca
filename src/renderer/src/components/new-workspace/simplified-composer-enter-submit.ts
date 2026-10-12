import type React from 'react'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'

// Simplified composers have no name field to own Enter, so plain Enter in any input submits.
export function submitSimplifiedComposerOnEnter(
  event: React.KeyboardEvent<HTMLElement>,
  props: Pick<NewWorkspaceComposerCardProps, 'simplifiedFields' | 'createDisabled' | 'onCreate'>
): void {
  if (
    props.simplifiedFields &&
    event.key === 'Enter' &&
    !event.defaultPrevented &&
    !event.nativeEvent.isComposing &&
    !isScreenSubmitShortcut(event) &&
    event.target instanceof HTMLInputElement &&
    !props.createDisabled
  ) {
    event.preventDefault()
    props.onCreate()
  }
}
