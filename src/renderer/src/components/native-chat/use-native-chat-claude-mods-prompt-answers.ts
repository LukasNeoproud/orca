import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  ClaudeModsAsk,
  ClaudeModsAskAnswer
} from '../../../../shared/claude-mods-prompt-answers'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { hasVisibleOverlay } from '@/lib/visible-overlay'
import { useAppStore } from '../../store'
import {
  answerClaudeModsAsk,
  openClaudeModsAskStream,
  supportsClaudeModsPromptAnswers
} from '../../runtime/claude-mods-prompt-answers-client'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { readNativeChatDraftCache } from './native-chat-draft-cache'
import {
  fillNativeChatPromptBox,
  isNativeChatSuggestionAcceptKey,
  nativeChatClaudeModsSuggestion,
  nativeChatClaudeModsSuggestionGhost,
  type NativeChatPromptBox
} from './native-chat-claude-mods-prompt-box'

type KeyEventLike = Parameters<typeof isNativeChatSuggestionAcceptKey>[0] & {
  preventDefault: () => void
}

export type NativeChatClaudeModsPromptAnswersArgs = {
  agent: string
  transport: { sessionId: string; runtimeEnvironmentId: string | null } | undefined
  draftScopeKey: string
  textareaRef: RefObject<NativeChatComposerInput | null>
  draft: string
  isWorking: boolean
  attachmentCount: number
  /** A prompt card holds the keys: Desktop refuses a fill under a dialog. */
  inputOwnedByCard: boolean
  isComposing: () => boolean
  setDraft: (value: string) => void
  setCaret: (caret: number) => void
}

/** A modal layer owns the keys; the composer's own pickers (listbox, menu) do not count. */
function dialogHoldsKeys(): boolean {
  return hasVisibleOverlay({
    ignoreMatches: '[role="listbox"], [role="menu"]',
    ignoreDismissed: true
  })
}

/**
 * Answers a Claude chat's mods when they copy, or read, fill or suggest into this composer
 * (`$.ui.copy`, `$.prompt.read/fill/suggest`), as Claude Code Desktop does. The suggestion shows
 * as the empty composer's placeholder; Tab or ArrowRight takes it.
 */
export function useNativeChatClaudeModsPromptAnswers(args: NativeChatClaudeModsPromptAnswersArgs): {
  /** The placeholder while a suggestion shows. */
  ghost: string | null
  /** Wraps the composer's key handler so an accept key takes a shown suggestion first. */
  keyDown: <E extends KeyEventLike>(next: (event: E) => void) => (event: E) => void
} {
  const enabled = useAppStore((store) => store.settings?.nativeChatClaudeMods !== false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const latest = useRef(args)
  latest.current = args
  // The box a fill left, until the editor shows it: the CLI reads right after every fill.
  const filledRef = useRef<NativeChatPromptBox | null>(null)
  const sessionId = args.transport?.sessionId
  const environmentId = args.transport?.runtimeEnvironmentId ?? null
  const wanted = enabled && args.agent === 'claude' && sessionId !== undefined

  const readBox = useCallback((): NativeChatPromptBox => {
    const { draftScopeKey, textareaRef } = latest.current
    const text = readNativeChatDraftCache(draftScopeKey)
    const input = textareaRef.current
    const filled = filledRef.current
    const cursor =
      input && input.value === text
        ? (input.selectionStart ?? text.length)
        : filled?.text === text
          ? filled.cursor
          : text.length
    return { text, cursor: Math.min(Math.max(0, cursor), text.length) }
  }, [])

  const place = useCallback((box: NativeChatPromptBox): void => {
    const { setDraft, setCaret, textareaRef } = latest.current
    filledRef.current = box
    setDraft(box.text)
    setCaret(box.cursor)
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(box.cursor, box.cursor))
  }, [])

  const answer = useCallback(
    async (ask: ClaudeModsAsk): Promise<ClaudeModsAskAnswer> => {
      const current = latest.current
      const input = current.textareaRef.current
      switch (ask.subtype) {
        case 'ui_copy':
          return window.api.ui.writeClipboardText(ask.text).then(
            () => ({ copied: true }),
            () => ({ copied: false })
          )
        case 'ui_prompt_read':
          return readBox()
        case 'ui_prompt_fill': {
          if (
            !input ||
            input.disabled ||
            current.inputOwnedByCard ||
            current.isComposing() ||
            dialogHoldsKeys()
          ) {
            return { filled: false }
          }
          place(fillNativeChatPromptBox(readBox(), ask.text, ask.mode))
          return { filled: true }
        }
        case 'ui_prompt_suggest': {
          const text = nativeChatClaudeModsSuggestion(ask.text)
          const shown =
            text !== null &&
            input !== null &&
            !current.inputOwnedByCard &&
            !current.isWorking &&
            current.attachmentCount === 0 &&
            readBox().text.trim() === ''
          if (shown) {
            setSuggestion(text)
          }
          return { shown }
        }
      }
    },
    [place, readBox]
  )

  useEffect(() => {
    if (!wanted || sessionId === undefined) {
      return
    }
    const target: RuntimeClientTarget =
      environmentId === null ? { kind: 'local' } : { kind: 'environment', environmentId }
    let stop: (() => void) | null = null
    let cancelled = false
    void supportsClaudeModsPromptAnswers(target).then((supported) => {
      if (!supported || cancelled) {
        return
      }
      stop = openClaudeModsAskStream(target, sessionId, (ask) => {
        void answer(ask).then((reply) => answerClaudeModsAsk(target, sessionId, ask.id, reply))
      })
    })
    return () => {
      cancelled = true
      stop?.()
      setSuggestion(null)
    }
  }, [answer, environmentId, sessionId, wanted])

  // Desktop drops the suggestion whenever a turn starts.
  const [wasWorking, setWasWorking] = useState(args.isWorking)
  if (args.isWorking !== wasWorking) {
    setWasWorking(args.isWorking)
    if (args.isWorking) {
      setSuggestion(null)
    }
  }

  const visible =
    suggestion !== null &&
    args.draft.trim() === '' &&
    args.attachmentCount === 0 &&
    !args.isWorking &&
    !args.inputOwnedByCard
      ? suggestion
      : null

  const keyDown = useCallback(
    <E extends KeyEventLike>(next: (event: E) => void) =>
      (event: E): void => {
        if (
          visible === null ||
          latest.current.isComposing() ||
          !isNativeChatSuggestionAcceptKey(event)
        ) {
          next(event)
          return
        }
        event.preventDefault()
        setSuggestion(null)
        place({ text: visible, cursor: visible.length })
      },
    [place, visible]
  )

  return {
    ghost: visible === null ? null : nativeChatClaudeModsSuggestionGhost(visible),
    keyDown
  }
}
