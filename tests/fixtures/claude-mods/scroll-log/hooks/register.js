const PANE = 'scroll-log'
let rows = Array.from({ length: 30 }, (_, i) => `row ${i + 1}`)
let ticking = null

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'scroll-log', description: 'Open the scroll-log pane' })
    return next(e)
  })

  on('command.run', { command: 'scroll-log' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Scroll log', focus: true, closeOnEscape: true, rows: 12 })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    return Box({
      flexDirection: 'column',
      children: [
        Box({
          flexDirection: 'row',
          columnGap: 1,
          flexWrap: 'wrap',
          children: [
            Button({
              key: 'top',
              label: 'Top',
              hotkey: 't',
              onPress: () => $.ui.scroll({ in: PANE, to: 'start' })
            }),
            Button({
              key: 'end',
              label: 'End',
              hotkey: 'e',
              onPress: () => $.ui.scroll({ in: PANE, to: 'end' })
            }),
            Button({
              key: 'reveal',
              label: 'Row 15',
              hotkey: 'r',
              onPress: () => $.ui.scroll({ in: PANE, to: { key: 'row-15' }, block: 'center' })
            }),
            Button({
              key: 'follow',
              label: ticking ? 'Stop' : 'Follow',
              hotkey: 'f',
              onPress: async () => {
                if (ticking) {
                  ticking()
                  ticking = null
                } else {
                  await $.ui.scroll({ in: PANE, to: 'end' })
                  ticking = $.clock.every(700, () => {
                    rows = [...rows, `row ${rows.length + 1}`]
                    redraw()
                  })
                }
                redraw()
              }
            }),
            Button({
              key: 'focus-end',
              label: 'Focus End',
              hotkey: 'g',
              onPress: () => $.ui.focus({ requestId: PANE, key: 'end' })
            })
          ]
        }),
        ...rows.map((row, i) =>
          Box({ key: `row-${i + 1}`, children: [Text({ dimColor: i % 2 === 1, children: [row] })] })
        )
      ]
    })
  })
}
