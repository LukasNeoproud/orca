// Each command asks the attached surface once and logs the answer, so a probe sees both ends.
export function register(on) {
  on('session.start', async ($, e, next) => {
    for (const name of [
      'ask-copy',
      'ask-read',
      'ask-fill',
      'ask-append',
      'ask-insert',
      'ask-suggest'
    ]) {
      await $.command.register({ name, description: `Fixture: ${name}` })
    }
    return next(e)
  })

  on('command.run', { command: 'ask-copy' }, async ($) => {
    await $.ui.log(
      `copy: ${JSON.stringify(await $.ui.copy({ text: 'copied by prompt-asks', surface: 'desktop' }))}`
    )
    return {}
  })
  on('command.run', { command: 'ask-read' }, async ($) => {
    await $.ui.log(`read: ${JSON.stringify(await $.prompt.read())}`)
    return {}
  })
  for (const mode of ['replace', 'append', 'insert']) {
    const command = mode === 'replace' ? 'ask-fill' : `ask-${mode}`
    on('command.run', { command }, async ($) => {
      const fillPrompt = $.prompt.fill.bind($.prompt)
      const answer = await fillPrompt({ text: `filled ${mode}`, mode })
      await $.ui.log(`fill ${mode}: ${JSON.stringify(answer)}`)
      return {}
    })
  }
  on('command.run', { command: 'ask-suggest' }, async ($) => {
    await $.ui.log(`suggest: ${JSON.stringify(await $.prompt.suggest({ text: 'run the tests' }))}`)
    return {}
  })
}
