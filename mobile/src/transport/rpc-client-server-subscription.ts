export function isImageStreamMethod(method: string): boolean {
  return method === 'browser.screencast' || method === 'emulator.mobile.stream'
}

export function buildReadyStreamUnsubscribe(
  method: string,
  subscriptionId: string
): { method: string; params: { subscriptionId: string } } | null {
  if (method === 'browser.screencast') {
    return { method: 'browser.screencast.unsubscribe', params: { subscriptionId } }
  }
  if (method === 'emulator.mobile.stream') {
    return { method: 'emulator.mobile.unsubscribe', params: { subscriptionId } }
  }
  if (method === 'runtime.clientEvents.subscribe') {
    return { method: 'runtime.clientEvents.unsubscribe', params: { subscriptionId } }
  }
  return null
}
