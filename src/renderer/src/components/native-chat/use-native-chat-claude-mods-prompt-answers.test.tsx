// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeModsAsk } from '../../../../shared/claude-mods-prompt-answers'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import {
  clearNativeChatDraftCacheForTests,
  readNativeChatDraftCache,
  writeNativeChatDraftCache
} from './native-chat-draft-cache'
import {
  useNativeChatClaudeModsPromptAnswers,
  type NativeChatClaudeModsPromptAnswersArgs
} from './use-native-chat-claude-mods-prompt-answers'

type AskMocks = {
  onAsk: ((ask: ClaudeModsAsk) => void) | null
  answers: { id: string; answer: unknown }[]
  supported: boolean
}

const mocks = vi.hoisted((): AskMocks => ({ onAsk: null, answers: [], supported: true }))
vi.mock('../../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ settings: {} })
}))
vi.mock('../../runtime/claude-mods-prompt-answers-client', () => ({
  supportsClaudeModsPromptAnswers: async () => mocks.supported,
  openClaudeModsAskStream: (
    _target: unknown,
    _session: string,
    onAsk: (ask: ClaudeModsAsk) => void
  ) => {
    mocks.onAsk = onAsk
    return () => {
      mocks.onAsk = null
    }
  },
  answerClaudeModsAsk: async (_target: unknown, _session: string, id: string, answer: unknown) => {
    mocks.answers.push({ id, answer })
  }
}))

const SCOPE = 'scope-1'

function fakeInput(): NativeChatComposerInput {
  return {
    get value() {
      return readNativeChatDraftCache(SCOPE)
    },
    selectionStart: 2,
    selectionEnd: 2,
    disabled: false,
    focus: () => {},
    select: () => {},
    setSelectionRange: () => {}
  }
}

function setup(overrides: Partial<NativeChatClaudeModsPromptAnswersArgs> = {}) {
  const input = fakeInput()
  const props: NativeChatClaudeModsPromptAnswersArgs = {
    agent: 'claude',
    transport: { sessionId: 'session-1', runtimeEnvironmentId: null },
    draftScopeKey: SCOPE,
    textareaRef: { current: input },
    draft: readNativeChatDraftCache(SCOPE),
    isWorking: false,
    attachmentCount: 0,
    inputOwnedByCard: false,
    isComposing: () => false,
    setDraft: (value) => writeNativeChatDraftCache(SCOPE, value),
    setCaret: () => {},
    ...overrides
  }
  const hook = renderHook(
    (current: NativeChatClaudeModsPromptAnswersArgs) =>
      useNativeChatClaudeModsPromptAnswers(current),
    { initialProps: props }
  )
  return { ...hook, props }
}

async function ask(next: ClaudeModsAsk): Promise<unknown> {
  await act(async () => {
    mocks.onAsk?.(next)
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
  return mocks.answers.find((entry) => entry.id === next.id)?.answer
}

beforeEach(() => {
  clearNativeChatDraftCacheForTests()
  mocks.answers = []
  mocks.supported = true
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 0))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mounted(overrides?: Partial<NativeChatClaudeModsPromptAnswersArgs>) {
  const hook = setup(overrides)
  await act(async () => {
    await Promise.resolve()
  })
  return hook
}

describe('useNativeChatClaudeModsPromptAnswers', () => {
  it('reads the draft with its caret and fills by each mode', async () => {
    writeNativeChatDraftCache(SCOPE, 'ab cd')
    await mounted()
    expect(await ask({ id: 'r1', subtype: 'ui_prompt_read' })).toEqual({ text: 'ab cd', cursor: 2 })
    expect(await ask({ id: 'f1', subtype: 'ui_prompt_fill', text: 'X', mode: 'insert' })).toEqual({
      filled: true
    })
    expect(readNativeChatDraftCache(SCOPE)).toBe('abX cd')
    expect(
      await ask({ id: 'f2', subtype: 'ui_prompt_fill', text: 'new', mode: 'replace' })
    ).toEqual({
      filled: true
    })
    expect(readNativeChatDraftCache(SCOPE)).toBe('new')
  })

  it('refuses a fill while a prompt card or a dialog holds the keys', async () => {
    const card = await mounted({ inputOwnedByCard: true })
    expect(await ask({ id: 'f1', subtype: 'ui_prompt_fill', text: 'X', mode: 'replace' })).toEqual({
      filled: false
    })
    card.unmount()
    await mounted()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dialog guard reads only `length`.
    dialog.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList
    document.body.append(dialog)
    expect(await ask({ id: 'f2', subtype: 'ui_prompt_fill', text: 'X', mode: 'replace' })).toEqual({
      filled: false
    })
    expect(readNativeChatDraftCache(SCOPE)).toBe('')
  })

  it('copies through the app clipboard', async () => {
    const writeClipboardText = vi.fn(async () => {})
    vi.stubGlobal('api', { ui: { writeClipboardText } })
    await mounted()
    expect(await ask({ id: 'c1', subtype: 'ui_copy', text: 'hi' })).toEqual({ copied: true })
    expect(writeClipboardText).toHaveBeenCalledWith('hi')
  })

  it('shows a suggestion only in an empty idle composer, and Tab takes it', async () => {
    const hook = await mounted()
    expect(await ask({ id: 's1', subtype: 'ui_prompt_suggest', text: 'run the\ntests' })).toEqual({
      shown: true
    })
    expect(hook.result.current.ghost).toBe('run the tests')
    const next = vi.fn()
    const preventDefault = vi.fn()
    const key = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault }
    act(() => hook.result.current.keyDown(next)({ ...key, key: 'Tab' }))
    expect(preventDefault).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    expect(readNativeChatDraftCache(SCOPE)).toBe('run the\ntests')
    hook.rerender({ ...hook.props, draft: 'run the\ntests' })
    expect(hook.result.current.ghost).toBeNull()
    act(() => hook.result.current.keyDown(next)({ ...key, key: 'Tab' }))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('refuses a suggestion over a draft or a running turn, and drops one when a turn starts', async () => {
    writeNativeChatDraftCache(SCOPE, 'typed')
    const typed = await mounted()
    expect(await ask({ id: 's1', subtype: 'ui_prompt_suggest', text: 'x' })).toEqual({
      shown: false
    })
    typed.unmount()
    writeNativeChatDraftCache(SCOPE, '')
    const hook = await mounted()
    await ask({ id: 's2', subtype: 'ui_prompt_suggest', text: 'x' })
    expect(hook.result.current.ghost).toBe('x')
    hook.rerender({ ...hook.props, isWorking: true })
    hook.rerender({ ...hook.props, isWorking: false })
    expect(hook.result.current.ghost).toBeNull()
  })

  it('does not listen for a non-Claude chat or a host without the capability', async () => {
    await mounted({ agent: 'codex' })
    expect(mocks.onAsk).toBeNull()
    mocks.supported = false
    await mounted()
    expect(mocks.onAsk).toBeNull()
  })
})
