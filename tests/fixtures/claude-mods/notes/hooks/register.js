const PANE = 'notes'
let notes = []

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'notes', description: 'Open the notes pane' })
    const saved = await $.store.get('notes')
    if (Array.isArray(saved)) {
      notes = saved.filter((note) => typeof note === 'string')
    }
    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Notes', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const save = async () => {
      redraw()
      await $.store.set('notes', notes)
    }
    return Box({
      flexDirection: 'column',
      children: [
        Input({
          key: 'new-note',
          label: 'Note',
          placeholder: 'Type a note and press Enter',
          value: '',
          submitLabel: 'add',
          autoFocus: true,
          onSubmit: async (value) => {
            if (!value.trim()) {
              return
            }
            notes = [...notes, value.trim()]
            await save()
          }
        }),
        Text({
          dimColor: true,
          children: [notes.length + (notes.length === 1 ? ' note' : ' notes')]
        }),
        ...notes.map((note, i) =>
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Button({
                key: `delete-${i}`,
                label: 'x',
                plain: true,
                onPress: async () => {
                  notes = notes.filter((_, j) => j !== i)
                  await save()
                }
              }),
              Text({ children: [note] })
            ]
          })
        )
      ]
    })
  })
}
