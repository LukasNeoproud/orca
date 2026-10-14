// Engine nodes only sit directly in plain column Boxes (no width/height/position/overflow/display).
let invalidated = false

export function register(on) {
  on('session.start', async ($, e, next) => {
    // One timed invalidate so the probe can record the push's `instances` shape.
    if (!invalidated) {
      invalidated = true
      $.clock.after(4000, () => $.ui.invalidate('ui.render'))
    }
    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const text = typeof e.props.text === 'string' ? `» ${e.props.text}` : e.props.text
    return next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [Text({ dimColor: true, children: ['mod'] }), await next(e)]
    })
  })

  // The matcher cannot filter on props.tool (a `tool` matcher hooks the site but never ran), so check here.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Bash') {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const command = typeof e.props.input?.command === 'string' ? e.props.input.command : ''
    return Box({
      flexDirection: 'column',
      children: [Text({ dimColor: true, children: [`$ ${command}`] }), await next(e)]
    })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [await next(e), Text({ dimColor: true, children: ['result marked by mod'] })]
    })
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [Text({ children: ['asked via mod'] }), await next(e)]
    })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [Text({ dimColor: true, children: ['mod output'] }), await next(e)]
    })
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    await $.ui.log(`ToolGroup render: ${e.props.calls?.length ?? 0} calls`)
    return next(e)
  })

  // Pass-through hooks: `hooked` and the log show whether a desktop surface raises these sites.
  for (const component of [
    'TurnDuration',
    'InfoNotice',
    'PromptHint',
    'SessionMode',
    'ToolProgress'
  ]) {
    on('ui.render', { component }, async ($, e, next) => {
      await $.ui.log(`${component} render`)
      return next(e)
    })
  }
}
