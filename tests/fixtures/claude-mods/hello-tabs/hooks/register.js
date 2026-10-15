const PANE = 'hello-tabs'

let tab = 'one'
let count = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hello-tabs', description: 'Open the hello-tabs pane' })
    const saved = await $.store.get('count')
    if (typeof saved === 'number') {
      count = saved
    }
    return next(e)
  })

  on('command.run', { command: 'hello-tabs' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Hello tabs', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const tabButton = (name, label, hotkey) =>
      Button({
        key: `tab-${name}`,
        label,
        hotkey,
        plain: true,
        dimColor: tab !== name,
        onPress: () => {
          tab = name
          redraw()
        }
      })
    const body =
      tab === 'one'
        ? [Text({ children: ['This is the first tab.'] })]
        : [
            Box({
              flexDirection: 'row',
              columnGap: 2,
              children: [
                Button({
                  key: 'more',
                  label: 'Add one',
                  hotkey: 'a',
                  onPress: async () => {
                    count += 1
                    redraw()
                    await $.store.set('count', count)
                  }
                }),
                Text({ key: 'count', children: [`Count: ${count}`] })
              ]
            })
          ]
    return Box({
      flexDirection: 'column',
      children: [
        Box({
          flexDirection: 'row',
          columnGap: 3,
          children: [tabButton('one', 'One', '1'), tabButton('two', 'Two', '2')]
        }),
        Text({ children: [' '] }),
        ...body
      ]
    })
  })
}
