const PANE = 'svg'
const VALUES = [3, 7, 4, 9, 6]

function chart() {
  const bars = VALUES.map(
    (v, i) =>
      `<rect x="${10 + i * 36}" y="${110 - v * 10}" width="26" height="${v * 10}" fill="#d97757"/>`
  ).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">${bars}<line x1="0" y1="110" x2="200" y2="110" stroke="#888"/></svg>`
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'svg', description: 'Open the svg chart pane' })
    return next(e)
  })

  on('command.run', { command: 'svg' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Chart' })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Svg } = $.ui.resolve(e)
    if (!Svg) {
      return Text({ children: ['This surface draws no Svg.'] })
    }
    return Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, children: ['Five values'] }),
        Svg({ source: chart(), alt: 'Bar chart of five values' })
      ]
    })
  })
}
