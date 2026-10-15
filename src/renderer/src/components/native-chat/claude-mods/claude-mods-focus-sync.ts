// One site's keyboard hold and focus ring, told to the engine and moved by it. The site holds the
// keyboard while DOM focus is inside its container; the ring is a Button, Input or Select the
// person (or an `autoFocus` take) landed on. The engine's answer or push can move it elsewhere.

import {
  CLAUDE_MODS_CONTROL_ATTRIBUTE,
  CLAUDE_MODS_KEY_ATTRIBUTE,
  CLAUDE_MODS_OWNER_ATTRIBUTE
} from './claude-mods-layout-measure'

export const CLAUDE_MODS_AUTOFOCUS_ATTRIBUTE = 'data-claude-mods-autofocus'

/** The attributes that make a drawn Button, Input or Select addressable for measuring and focus. */
export function claudeModsControlAttributes(
  key: string | undefined,
  plugin: string | undefined,
  autoFocus: boolean
): Record<string, string | undefined> {
  return {
    [CLAUDE_MODS_CONTROL_ATTRIBUTE]: '',
    [CLAUDE_MODS_KEY_ATTRIBUTE]: key,
    [CLAUDE_MODS_OWNER_ATTRIBUTE]: plugin,
    [CLAUDE_MODS_AUTOFOCUS_ATTRIBUTE]: autoFocus ? '' : undefined
  }
}

export type ClaudeModsFocusElement = { plugin: string; key: string }

export type ClaudeModsFocusDeps = {
  component: string
  instanceId: string
  request: (fields: Record<string, unknown>) => Promise<unknown>
}

/** Select popups render outside the container; focus moving into one is still the site's. */
const OUTSIDE_PART_OF_SITE = '[role="listbox"], [data-radix-popper-content-wrapper]'

/** Whether `other` (focus's previous or next element) is the site's own, popups it opened included. */
export function isClaudeModsFocusWithinSite(
  container: HTMLElement,
  other: EventTarget | null
): boolean {
  return (
    other instanceof Element &&
    (container.contains(other) || other.closest(OUTSIDE_PART_OF_SITE) !== null)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameElement(a: ClaudeModsFocusElement | null, b: ClaudeModsFocusElement | null): boolean {
  return a?.plugin === b?.plugin && a?.key === b?.key
}

function elementOf(control: Element): ClaudeModsFocusElement | null {
  const plugin = control.getAttribute(CLAUDE_MODS_OWNER_ATTRIBUTE)
  const key = control.getAttribute(CLAUDE_MODS_KEY_ATTRIBUTE)
  return plugin && key ? { plugin, key } : null
}

function readElement(value: unknown): ClaudeModsFocusElement | null {
  return isRecord(value) && typeof value.plugin === 'string' && typeof value.key === 'string'
    ? { plugin: value.plugin, key: value.key }
    : null
}

export class ClaudeModsFocusSync {
  private held = false
  private holder: ClaudeModsFocusElement | null = null
  /** Our own `focus()` calls raise focus events that are not the person's. */
  private silent = false
  private report = 0
  private unfulfilled: ClaudeModsFocusElement | null = null

  constructor(
    private readonly deps: ClaudeModsFocusDeps,
    private readonly container: HTMLElement
  ) {}

  attach(): () => void {
    const onIn = (event: FocusEvent): void => this.focusEntered(event)
    const onOut = (event: FocusEvent): void => this.focusLeft(event)
    this.container.addEventListener('focusin', onIn)
    this.container.addEventListener('focusout', onOut)
    return () => {
      this.container.removeEventListener('focusin', onIn)
      this.container.removeEventListener('focusout', onOut)
    }
  }

  /** The control a plugin and key name, if the site draws it now. */
  findControl(element: ClaudeModsFocusElement): HTMLElement | null {
    for (const control of this.container.querySelectorAll<HTMLElement>(
      `[${CLAUDE_MODS_CONTROL_ATTRIBUTE}]`
    )) {
      if (sameElement(elementOf(control), element)) {
        return control
      }
    }
    return null
  }

  /** The site took the keyboard (a pane opened asking for it): the first `autoFocus` takes the ring. */
  takeAutoFocus(): boolean {
    const target = this.container.querySelector<HTMLElement>(`[${CLAUDE_MODS_AUTOFOCUS_ATTRIBUTE}]`)
    const element = target ? elementOf(target) : null
    if (!target || !element) {
      return false
    }
    this.focusSilently(target)
    this.held = true
    if (!sameElement(this.holder, element)) {
      this.holder = element
      this.tell(true, element, 'auto')
    }
    return true
  }

  /**
   * A plugin's `ui_focus` push. The engine pushes only to a site that holds the keyboard, so one
   * that crosses the hold's release is stale. A control not drawn yet is tried once more after the
   * next drawing, never later.
   */
  applyPush(element: ClaudeModsFocusElement): void {
    this.unfulfilled = null
    if (!this.held) {
      return
    }
    const control = this.findControl(element)
    if (!control) {
      this.unfulfilled = element
      return
    }
    this.holder = element
    this.focusSilently(control)
  }

  afterLayout(): void {
    const pending = this.unfulfilled
    this.unfulfilled = null
    if (pending) {
      this.applyPush(pending)
      // Still not drawn after the redraw it was waiting for: give up.
      this.unfulfilled = null
    }
  }

  private focusSilently(control: HTMLElement): void {
    this.silent = true
    try {
      control.focus()
    } finally {
      this.silent = false
    }
  }

  private focusEntered(event: FocusEvent): void {
    if (this.silent) {
      this.held = true
      return
    }
    // The person moved the ring: a push that was waiting for a redraw is stale.
    this.unfulfilled = null
    const target = event.target instanceof Element ? event.target : null
    const control = target?.closest(`[${CLAUDE_MODS_CONTROL_ATTRIBUTE}]`) ?? null
    const element = control ? elementOf(control) : null
    if (element) {
      if (!this.held || !sameElement(this.holder, element)) {
        this.held = true
        this.holder = element
        this.tell(true, element, 'person')
      }
    } else if (!this.held) {
      this.held = true
      this.tell(true, target === this.container ? null : undefined, 'person')
    } else if (target === this.container && this.holder) {
      this.holder = null
      this.tell(true, null, 'person')
    }
  }

  private focusLeft(event: FocusEvent): void {
    if (isClaudeModsFocusWithinSite(this.container, event.relatedTarget)) {
      return
    }
    this.unfulfilled = null
    if (this.held) {
      this.held = false
      this.holder = null
      this.tell(false)
    }
  }

  /** `element` undefined reports the hold alone, null names the container, else a control. */
  private tell(
    isHeld: boolean,
    element?: ClaudeModsFocusElement | null,
    by?: 'person' | 'auto'
  ): void {
    const report = ++this.report
    void this.deps
      .request({
        component: this.deps.component,
        instance_id: this.deps.instanceId,
        is_held: isHeld,
        ...(element === undefined ? {} : { element }),
        ...(by && element !== undefined ? { by } : {})
      })
      .then((answer) => {
        // A later report supersedes this answer; the person has moved on.
        if (report !== this.report || !isRecord(answer)) {
          return
        }
        const redirect = readElement(answer.element)
        if (redirect && isHeld && !sameElement(redirect, this.holder)) {
          this.applyPush(redirect)
        }
      })
  }
}
