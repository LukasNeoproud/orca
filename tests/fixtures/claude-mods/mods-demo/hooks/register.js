// The demo's guide: one pane that explains each mod loaded beside it and starts it with a press.
const PANE = 'mods-demo'

const OFFICIAL = [
  {
    key: 'token-weather',
    title: 'token-weather (Anthropic)',
    what: 'A forecast of the context window in the band above the composer, updated after each turn.',
    prompt: 'In two sentences, what is in this repository?',
    action: 'Run a short turn'
  },
  {
    key: 'blast-radius',
    title: 'blast-radius (Anthropic)',
    what: 'Holds a risky shell command and shows what it would delete, with Proceed and Cancel.',
    prompt: 'Use the Bash tool to run exactly: rm -rf build',
    action: 'Ask Claude to rm -rf build'
  },
  {
    key: 'replay-theater',
    title: 'replay-theater (Anthropic)',
    what: 'Records the file edits of a turn; afterwards Replay steps through them diff by diff.',
    prompt:
      "Edit src/greet.js so the greeting says 'Hello, mods!', and add a line 'Edited for the mods demo.' to the end of README.md.",
    action: 'Ask Claude to edit two files',
    command: 'replay',
    commandLabel: 'Open the replay'
  }
]

const ORCA = [
  { command: 'hello-tabs', label: 'Tabs and a counter kept in $.store' },
  { command: 'notes', label: 'A text field that adds rows' },
  { command: 'picker', label: 'Select, highlighted code, diff, Markdown, link' },
  { command: 'svg', label: 'An SVG chart' },
  { command: 'scroll-log', label: 'Plugin-driven scrolling, follow end and focus' },
  { command: 'client-board', label: 'A Client: the mod runs its own module in a sandbox' },
  { command: 'notify', label: 'A toast, a status line and a log line' }
]

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods-demo',
      description: 'Open the Claude Code mods demo guide'
    })
    return next(e)
  })

  on('command.run', { command: 'mods-demo' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Mods demo' })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const official = OFFICIAL.map((mod) =>
      Box({
        key: `official-${mod.key}`,
        flexDirection: 'column',
        borderStyle: 'round',
        paddingX: 1,
        children: [
          Text({ bold: true, children: [mod.title] }),
          Text({ dimColor: true, children: [mod.what] }),
          Box({
            flexDirection: 'row',
            columnGap: 1,
            flexWrap: 'wrap',
            children: [
              Button({
                key: `try-${mod.key}`,
                label: mod.action,
                variant: 'primary',
                onPress: () => $.prompt.submit({ text: mod.prompt })
              }),
              ...(mod.command
                ? [
                    Button({
                      key: `run-${mod.command}`,
                      label: mod.commandLabel,
                      onPress: () => $.command.run({ command: mod.command })
                    })
                  ]
                : [])
            ]
          })
        ]
      })
    )
    const orca = ORCA.map((item) =>
      Box({
        key: `orca-${item.command}`,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: `open-${item.command}`,
            label: `/${item.command}`,
            plain: true,
            onPress: () => $.command.run({ command: item.command })
          }),
          Text({ dimColor: true, children: [item.label] })
        ]
      })
    )
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: [
        Markdown({
          text: 'Claude Code **mods** draw their own interface. Everything in this pane, the band above the composer and the marks in the transcript is drawn by mods loaded in this chat.'
        }),
        Text({ bold: true, children: ["Anthropic's sample mods"] }),
        ...official,
        Text({ bold: true, children: ["Orca's test mods"] }),
        ...orca,
        Text({
          dimColor: true,
          children: [
            'Always on: hover-card (band, hover it), transcript-marks (» on your messages, marks on Bash calls and replies), spinner-word (the working line).'
          ]
        })
      ]
    })
  })
}
