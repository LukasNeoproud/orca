export function register(on) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    return Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Box({
          key: 'chip',
          borderStyle: 'round',
          paddingX: 1,
          hover: { borderColor: 'warning' },
          children: [
            Text({ hover: { color: 'warning', bold: true }, children: ['hover me'] }),
            Box({
              position: 'absolute',
              top: -3,
              left: 2,
              display: 'none',
              borderStyle: 'single',
              paddingX: 1,
              backgroundColor: 'background',
              hover: { display: 'flex' },
              children: [Text({ children: ['the hidden card'] })]
            })
          ]
        }),
        Text({ hover: { scope: 'pair', underline: true }, children: ['group A'] }),
        Text({ hover: { scope: 'pair', underline: true }, children: ['group B'] }),
        Button({
          key: 'hb',
          label: 'Hover button',
          hover: { scope: 'pair', color: 'success' },
          onPress: () => $.ui.toast('pressed')
        })
      ]
    })
  })
}
