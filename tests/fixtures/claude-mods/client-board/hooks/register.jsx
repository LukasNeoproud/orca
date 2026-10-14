const PANE = 'client-board'

// What the plugin last answered the board's surface.post with; drawn back as the board's props.
let replies = 0
let lastAsk = null

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'client-board', description: 'Open the client board pane' })
    return next(e)
  })

  on('command.run', { command: 'client-board' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Client board', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.message', async ($, e, next) => {
    if (e.element !== 'board') {
      return next(e)
    }
    replies += 1
    lastAsk = e.data
    return { props: { title: 'Client board', replies, lastAsk } }
  })

  on('ui.fault', async ($, e, next) => {
    $.ui.log(`board fault (${e.phase}): ${e.reason}`)
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }
    const { Box, Text, Client } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>Drawn by the plugin; the board below runs its own module.</Text>
        <Client
          key="board"
          module="./board.jsx"
          props={{ title: 'Client board', replies, lastAsk }}
          width="100%"
          height={14}
        />
      </Box>
    )
  })
}
