export function emulatorCodecBenchmarkScene(width: number, height: number): string {
  return `(() => {
    const canvas = document.createElement('canvas')
    canvas.width = ${width}; canvas.height = ${height}
    const ctx = canvas.getContext('2d')
    const colors = { bg: '#10141b', panel: '#171d26', line: '#263241', text: '#d6e2ed',
      muted: '#8294a5', green: '#70d3a2', blue: '#86b9ec', amber: '#e7bd76' }
    function scene(offset) {
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = colors.panel; ctx.fillRect(0, 0, canvas.width, 148)
      ctx.fillStyle = colors.text; ctx.font = 'bold 32px system-ui'
      ctx.fillText('Orca · Build session', 36, 64)
      ctx.fillStyle = colors.muted; ctx.font = '23px system-ui'
      ctx.fillText('mobile/src/session  •  tests running', 36, 108)
      ctx.fillStyle = colors.line; ctx.fillRect(0, 147, canvas.width, 2)
      ctx.fillStyle = colors.panel; ctx.fillRect(24, 176, canvas.width - 48, 260)
      ctx.fillStyle = colors.blue; ctx.font = 'bold 25px system-ui'
      ctx.fillText('Current task', 48, 220)
      ctx.fillStyle = colors.text; ctx.font = '25px system-ui'
      ctx.fillText('Stream emulator video to mobile', 48, 265)
      ctx.fillStyle = colors.muted; ctx.font = '21px system-ui'
      ctx.fillText('Connected · Pixel 9 API 35 · Responsive', 48, 310)
      ctx.fillStyle = colors.green; ctx.fillRect(48, 353, canvas.width - 96, 8)
      ctx.fillStyle = colors.muted; ctx.font = '20px system-ui'
      ctx.fillText('Live logs', 36, 485)
      ctx.fillStyle = colors.panel; ctx.fillRect(24, 510, canvas.width - 48, canvas.height - 602)
      ctx.font = '20px monospace'
      const verbs = ['INFO', 'DEBUG', 'PASS', 'WARN']
      const messages = [
        'emulator transport connected', 'decoding frame in native view',
        'session state synchronized', 'input acknowledgement received',
        'render queue drained', 'codec negotiated with host',
        'stream heartbeat received', 'terminal output updated'
      ]
      for (let row = 0; row < 42; row++) {
        const index = row + offset
        const y = 550 + row * 22
        const verb = verbs[index % verbs.length]
        ctx.fillStyle = verb === 'PASS' ? colors.green : verb === 'WARN' ? colors.amber : colors.muted
        ctx.fillText(String(index + 1420).padStart(5, '0') + '  ' + verb, 45, y)
        ctx.fillStyle = index % 9 === 0 ? colors.blue : colors.text
        ctx.fillText(messages[index % messages.length], 220, y)
      }
      ctx.fillStyle = colors.panel; ctx.fillRect(0, canvas.height - 78, canvas.width, 78)
      ctx.fillStyle = colors.muted; ctx.font = '22px system-ui'
      ctx.fillText('⌘K  Command', 36, canvas.height - 29)
      return canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
    }
    return Array.from({ length: 32 }, (_, index) => scene(index))
  })()`
}
