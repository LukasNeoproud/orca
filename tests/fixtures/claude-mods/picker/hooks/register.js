const PANE = 'picker'
let language = 'ts'

const SAMPLES = {
  ts: {
    language: 'typescript',
    source: 'export function add(a: number, b: number): number {\n  return a + b\n}'
  },
  py: { language: 'python', source: 'def add(a, b):\n    return a + b' },
  diff: {
    format: 'diff',
    language: 'typescript',
    source: '@@ -1,3 +1,3 @@\n export function add(a, b) {\n-  return a - b\n+  return a + b\n }'
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'picker', description: 'Open the picker pane' })
    return next(e)
  })

  on('command.run', { command: 'picker' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Picker', focus: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Select, Code, Markdown, Link } = $.ui.resolve(e)
    const sample = SAMPLES[language]
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: [
        Select({
          key: 'language',
          label: 'Sample',
          value: language,
          options: [
            { value: 'ts', label: 'TypeScript' },
            { value: 'py', label: 'Python' },
            { value: 'diff', label: 'Diff' }
          ],
          onSelect: (value) => {
            language = value
            $.ui.invalidate('ui.render')
          }
        }),
        Code(
          sample.format === 'diff'
            ? { source: sample.source, language: sample.language, format: 'diff' }
            : { source: sample.source, language: sample.language, startLine: 1 }
        ),
        Markdown({
          text: '**Bold**, `code`, a [docs link](https://code.claude.com/docs/en/plugins/mods/overview) and a [bad link](javascript:alert(1)).\n\n- one\n- two'
        }),
        Box({
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ color: 'permission', bold: true, children: ['Link:'] }),
            Link({
              href: 'https://github.com/anthropics/claude-code',
              children: ['Claude Code on GitHub']
            })
          ]
        })
      ]
    })
  })
}
