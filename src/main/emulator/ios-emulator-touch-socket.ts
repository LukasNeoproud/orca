import type WebSocket from 'ws'

export function waitForIosTouchSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('iOS touch control did not connect')), 10_000)
    const finish = (error?: Error): void => {
      clearTimeout(timeout)
      socket.off('open', opened)
      socket.off('error', failed)
      socket.off('close', closed)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const opened = (): void => finish()
    const failed = (error: Error): void => finish(error)
    const closed = (): void => finish(new Error('iOS touch control closed'))
    socket.once('open', opened)
    socket.once('error', failed)
    socket.once('close', closed)
  })
}
