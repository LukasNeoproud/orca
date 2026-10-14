// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentJournalQuestion } from '../../../../../shared/agent-session-journal-types'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { ClaudeModsQuestionSite, ClaudeModsSpinnerSite } from './ClaudeModsSiteRows'
import { ClaudeModsSite } from './ClaudeModsSite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ENGINE = (ref: number) => ({ type: 'engine', ref })
const text = (value: string) => ({ type: 'Text', children: [value] })
const answer = (tree: unknown, props: Record<string, unknown> = {}, hooked = true) => ({
  tree,
  props,
  rewritten: Object.keys(props).length > 0,
  hooked
})

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function controllerAnswering(reply: unknown): ClaudeModsSurfaceController {
  return new ClaudeModsSurfaceController(
    {
      request: async () => reply,
      subscribe: async () => ({ unsubscribe: () => {} })
    },
    () => {}
  )
}

async function mount(controller: ClaudeModsSurfaceController | null, node: React.ReactNode) {
  await act(async () => {
    root.render(
      <ClaudeModsControllerContext.Provider value={controller}>
        {node}
      </ClaudeModsControllerContext.Provider>
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function site() {
  return (
    <ClaudeModsSite component="AssistantMessage" instanceId="m1" props={{ text: 'hello' }}>
      {(props) => <p data-testid="native">{String(props.text)}</p>}
    </ClaudeModsSite>
  )
}

describe('ClaudeModsSite', () => {
  it('draws its children alone without mods', async () => {
    await mount(null, site())
    expect(container.innerHTML).toBe('<p data-testid="native">hello</p>')
  })

  it('draws its children alone when no mod hooks the component', async () => {
    await mount(controllerAnswering(answer(ENGINE(0), {}, false)), site())
    expect(container.innerHTML).toBe('<p data-testid="native">hello</p>')
  })

  it('draws its children alone for a tree that is only core engine node', async () => {
    await mount(controllerAnswering(answer(ENGINE(0))), site())
    expect(container.innerHTML).toBe('<p data-testid="native">hello</p>')
  })

  it('draws children with the rewritten props for a rewritten engine node', async () => {
    await mount(controllerAnswering(answer(ENGINE(2), { text: 'reworded' })), site())
    expect(container.innerHTML).toBe('<p data-testid="native">reworded</p>')
  })

  const around = (ref: number) => ({
    type: 'Box',
    props: {},
    children: [text('note'), ENGINE(ref)]
  })

  it('draws a mod tree around the original drawing at ref 0', async () => {
    await mount(controllerAnswering(answer(around(0))), site())
    expect(container.textContent).toBe('notehello')
  })

  it('draws a mod tree around the rewritten drawing at another ref', async () => {
    await mount(controllerAnswering(answer(around(2), { text: 'reworded' })), site())
    expect(container.textContent).toBe('notereworded')
  })

  it('is not asked while the row is still streaming', async () => {
    let asked = 0
    const controller = new ClaudeModsSurfaceController(
      {
        request: async () => {
          asked += 1
          return answer(ENGINE(0))
        },
        subscribe: async () => ({ unsubscribe: () => {} })
      },
      () => {}
    )
    await mount(
      controller,
      <ClaudeModsSite component="AssistantMessage" instanceId="m1" props={{}} settled={false}>
        {() => <p>live</p>}
      </ClaudeModsSite>
    )
    expect(asked).toBe(0)
  })
})

const QUESTIONS: AgentJournalQuestion[] = [
  {
    id: 'q1',
    question: 'Pick one',
    multiSelect: false,
    options: [
      { id: 'o1', label: 'Alpha' },
      { id: 'o2', label: 'Beta' }
    ]
  }
]

function question(toolUseId: string | undefined) {
  return (
    <ClaudeModsQuestionSite
      toolUseId={toolUseId}
      questions={QUESTIONS}
      renderDrawing={(shown) => (
        <ul>
          {shown.flatMap((entry) => [
            <li key={entry.id}>{entry.question}</li>,
            ...entry.options.map((option) => <li key={option.id}>{option.label}</li>)
          ])}
        </ul>
      )}
    />
  )
}

describe('ClaudeModsQuestionSite', () => {
  const card = '<ul><li>Pick one</li><li>Alpha</li><li>Beta</li></ul>'

  it('draws content a mod put above the card', async () => {
    await mount(
      controllerAnswering(answer({ type: 'Box', props: {}, children: [text('above'), ENGINE(0)] })),
      question('toolu_q')
    )
    expect(container.textContent).toBe('abovePick oneAlphaBeta')
  })

  it('draws the card alone when content follows the engine node', async () => {
    await mount(
      controllerAnswering(answer({ type: 'Box', props: {}, children: [ENGINE(0), text('below')] })),
      question('toolu_q')
    )
    expect(container.innerHTML).toBe(card)
  })

  it('draws the card alone when the tree holds two engine nodes', async () => {
    await mount(
      controllerAnswering(answer({ type: 'Box', props: {}, children: [ENGINE(0), ENGINE(0)] })),
      question('toolu_q')
    )
    expect(container.innerHTML).toBe(card)
  })

  it('draws the card alone when the tree holds no engine node', async () => {
    await mount(
      controllerAnswering(answer({ type: 'Box', props: {}, children: [text('only a mod')] })),
      question('toolu_q')
    )
    expect(container.innerHTML).toBe(card)
  })

  it('relabels questions and options by position and keeps the ids Orca answers with', async () => {
    const rewritten = {
      questions: [
        {
          question: 'Choose',
          options: [{ label: 'Eins' }, { label: 'Zwei' }]
        }
      ]
    }
    await mount(controllerAnswering(answer(ENGINE(4), rewritten)), question('toolu_q'))
    expect(container.innerHTML).toBe('<ul><li>Choose</li><li>Eins</li><li>Zwei</li></ul>')
  })

  it('keeps the original words when the rewrite does not line up', async () => {
    const rewritten = { questions: [{ question: 'One' }, { question: 'Two' }] }
    await mount(controllerAnswering(answer(ENGINE(4), rewritten)), question('toolu_q'))
    expect(container.innerHTML).toBe(card)
  })

  it('is not asked about without the call id', async () => {
    await mount(
      controllerAnswering(answer({ type: 'Box', props: {}, children: [text('above'), ENGINE(0)] })),
      question(undefined)
    )
    expect(container.innerHTML).toBe(card)
  })
})

describe('ClaudeModsSpinnerSite', () => {
  function spinner(label: string) {
    return (
      <ClaudeModsSpinnerSite
        label={label}
        mode="requesting"
        renderDrawing={(shown) => <span>{shown}</span>}
      />
    )
  }

  it('keeps the label when the word is untouched, even without a trailing ellipsis', async () => {
    await mount(
      controllerAnswering(answer(ENGINE(1), { word: 'Thinking', suffix: '…' })),
      spinner('Thinking')
    )
    expect(container.innerHTML).toBe('<span>Thinking</span>')
  })

  it('draws a reworded word and suffix', async () => {
    await mount(
      controllerAnswering(answer(ENGINE(1), { word: 'Sauteing', suffix: '!' })),
      spinner('Working…')
    )
    expect(container.innerHTML).toBe('<span>Sauteing!</span>')
  })
})
