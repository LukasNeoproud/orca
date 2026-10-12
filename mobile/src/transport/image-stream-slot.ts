import { isImageStreamMethod } from './rpc-client-server-subscription'

/** The binary image lane (browser screencast or emulator video) belongs to one stream at a time. */
export class ImageStreamSlot {
  active: string | null = null
  pending: string | null = null

  /** Makes `id` the pending owner and returns the displaced streams, oldest owner first. */
  replace(id: string): string[] {
    const displaced = [this.active, this.pending].filter(
      (other): other is string => other !== null && other !== id
    )
    this.reset(id)
    return displaced
  }

  /** `replace` for image-stream methods; any other method displaces nothing. */
  admit(method: string, id: string): string[] {
    return isImageStreamMethod(method) ? this.replace(id) : []
  }

  /** A ready reply promotes its stream unless a newer subscribe already displaced it. */
  claim(id: string): boolean {
    if (this.pending !== id && this.active !== id) {
      return false
    }
    this.pending = null
    this.active = id
    return true
  }

  release(id: string): void {
    if (this.active === id) {
      this.active = null
    }
    if (this.pending === id) {
      this.pending = null
    }
  }

  reset(pending: string | null = null): void {
    this.active = null
    this.pending = pending
  }
}
