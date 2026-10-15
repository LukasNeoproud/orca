let turns = 0

export function register(on) {
  on('turn.complete', async ($, e, next) => {
    turns += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const percent = typeof usage?.context?.percent === 'number' ? usage.context.percent : null
    return Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Text({ color: 'promptBorder', bold: true, children: ['band-meter'] }),
        Text({ dimColor: true, children: [`context ${percent === null ? '–' : `${percent}%`}`] }),
        Text({ dimColor: true, children: [`turns ${turns}`] })
      ]
    })
  })
}
