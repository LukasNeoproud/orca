// Deterministic interactive PTY consumer; no AI requests or credentials.
const fs = require('node:fs')
const reportPath = process.argv[2]
let prompt = 'Existing draft'
let pending = ''
let submissions = 0
let pastes = 0
function render() {
  fs.writeFileSync(reportPath, JSON.stringify({ prompt, submissions, pastes }))
  process.stdout.write(
    `\x1b[H\x1b[2J${[
      'Terminal response comments',
      'Cache is cleared on every launch.',
      'Keep unrelated settings unchanged.',
      '',
      ...prompt.split('\n').map((line, index) => `${index ? '  ' : '> '}${line}`)
    ].join('\r\n')}`
  )
}
process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  while (pending) {
    if (pending.startsWith('\x1b[200~')) {
      const end = pending.indexOf('\x1b[201~')
      if (end === -1) {
        break
      }
      prompt += pending.slice(6, end).replace(/\r\n?/g, '\n')
      pending = pending.slice(end + 6)
      pastes++
    } else if ('\x1b[200~'.startsWith(pending)) {
      break
    } else {
      const char = pending[0]
      pending = pending.slice(1)
      if (char === '\x03') {
        process.exit(0)
      }
      if (char === '\r' || char === '\n') {
        submissions++
      } else if (char >= ' ') {
        prompt += char
      }
    }
  }
  render()
})
process.stdout.write('\x1b[?1049h\x1b[?2004h')
render()
