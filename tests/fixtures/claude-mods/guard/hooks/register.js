const PANE = 'guard'
// The held call: its command and the resolver its Proceed/Cancel buttons settle.
let pending = null

export function register(on) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/.test(e.command ?? '')) {
      return next(e)
    }
    const decision = await new Promise((resolve) => {
      pending = { command: e.command, resolve }
      void $.ui.open({ id: PANE, title: 'Guard', focus: true, holdToasts: true })
      $.ui.invalidate('ui.render')
    })
    pending = null
    await $.ui.close({ id: PANE })
    return decision === 'proceed'
      ? next(e)
      : { deny: 'The person cancelled this rm -rf in the guard pane.' }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!pending) {
      return Text({ dimColor: true, children: ['Nothing is held.'] })
    }
    const settle = (decision) => () => pending?.resolve(decision)
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: [
        Text({
          bold: true,
          color: 'warning',
          children: ['Claude wants to run a recursive delete:']
        }),
        Text({ children: [pending.command] }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({
              key: 'proceed',
              label: 'Proceed',
              variant: 'primary',
              hotkey: 'y',
              onPress: settle('proceed')
            }),
            Button({
              key: 'cancel',
              label: 'Cancel',
              role: 'dismiss',
              hotkey: 'n',
              autoFocus: true,
              onPress: settle('cancel')
            })
          ]
        })
      ]
    })
  })
}
