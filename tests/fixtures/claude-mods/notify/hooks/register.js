let runs = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notify',
      description: 'Show a toast, a status line and a log line'
    })
    await $.command.register({ name: 'notify-clear', description: 'Clear the notify status line' })
    return next(e)
  })

  on('command.run', { command: 'notify' }, async ($) => {
    runs += 1
    await $.ui.toast(`notify ran ${runs}${runs === 1 ? ' time' : ' times'}`)
    await $.ui.status(`notify: ${runs}`)
    await $.ui.log('notify wrote this line')
    return {}
  })

  on('command.run', { command: 'notify-clear' }, async ($) => {
    await $.ui.status()
    return {}
  })
}
