// A surface module: runs in the surface's own sandbox, draws with surface.elements and keeps
// its state there. Only surface.post reaches the plugin (its ui.message hook).
export default function Board(props, surface) {
  const { Box, Text, Button, Input } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ count: 0, ticks: 0, typed: '', submitted: '', cursor: 0, click: null })
    surface.every(1000, () =>
      surface.setState({ ...surface.state, ticks: surface.state.ticks + 1 })
    )
    surface.onKey((key) => {
      const step = key.key === 'left' ? -1 : key.key === 'right' ? 1 : 0
      if (step !== 0) {
        const cursor = Math.max(0, Math.min(9, surface.state.cursor + step))
        surface.setState({ ...surface.state, cursor })
      }
    })
    surface.onPointer((pointer) => {
      if (pointer.type === 'down') {
        surface.setState({
          ...surface.state,
          click: { x: pointer.x, y: pointer.y, fine: pointer.fine }
        })
      }
    })
  }
  const state = surface.state ?? {
    count: 0,
    ticks: 0,
    typed: '',
    submitted: '',
    cursor: 0,
    click: null
  }
  const track = Array.from({ length: 10 }, (_, index) => (index === state.cursor ? '#' : '.')).join(
    ''
  )
  const click = state.click ? `${state.click.x},${state.click.y}` : 'none yet'
  return (
    <Box flexDirection="column" key="board-root" borderStyle="round" paddingX={1}>
      <Text bold>{props.title}</Text>
      <Text>
        Size {surface.columns}x{surface.rows}, ticks {state.ticks}
      </Text>
      <Box flexDirection="row" columnGap={2}>
        <Button
          key="count"
          label={`Count ${state.count}`}
          onPress={() => surface.setState({ ...surface.state, count: surface.state.count + 1 })}
        />
        <Button
          key="ask"
          label="Ask the plugin"
          onPress={() => surface.post({ ask: 'props', count: surface.state.count })}
        />
      </Box>
      <Input
        key="name"
        label="Name"
        placeholder="Type and press Enter"
        onInput={(value) => surface.setState({ ...surface.state, typed: value })}
        onSubmit={(value) => surface.setState({ ...surface.state, submitted: value })}
      />
      <Text>
        Typed {state.typed || '-'}, submitted {state.submitted || '-'}
      </Text>
      <Text>Arrows (click here first): {track}</Text>
      <Text>Last click: {click}</Text>
      <Text dimColor>
        Plugin replies {props.replies ?? 0}
        {props.lastAsk ? `, last ask count ${props.lastAsk.count}` : ''}
      </Text>
    </Box>
  )
}
