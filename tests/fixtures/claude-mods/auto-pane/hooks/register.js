const PANE = 'auto-pane'
let ticks = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    $.clock.after(3000, async () => {
      const placed = await $.ui.open({ id: PANE, title: 'Auto', focus: true })
      await $.ui.log(`auto-pane open: ${JSON.stringify(placed ?? null)}`)
      $.clock.every(1000, () => {
        ticks += 1
        $.ui.invalidate('ui.render')
      })
    })
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [
        Text({ children: [`Opened by a timer. Ticks: ${ticks}`] }),
        Button({
          key: 'close',
          label: 'Close',
          role: 'dismiss',
          onPress: () => $.ui.close({ id: PANE })
        })
      ]
    })
  })
}
