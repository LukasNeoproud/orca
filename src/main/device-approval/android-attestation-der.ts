export type DerNode = {
  data: Buffer
  tagClass: number
  tag: number
  constructed: boolean
  start: number
  contentStart: number
  end: number
}

function fail(): never {
  throw new Error('Invalid Android attestation DER')
}

export function readDer(data: Buffer, start = 0, limit = data.length): DerNode {
  if (start >= limit || limit > data.length) {
    fail()
  }
  let offset = start
  const first = data[offset++]!
  const tagClass = first >>> 6
  const constructed = (first & 0x20) !== 0
  let tag = first & 0x1f
  if (tag === 0x1f) {
    tag = 0
    let firstTagByte = true
    for (let count = 0; count < 4; count++) {
      if (offset >= limit) {
        fail()
      }
      const byte = data[offset++]!
      if (firstTagByte && (byte & 0x7f) === 0) {
        fail()
      }
      firstTagByte = false
      tag = tag * 128 + (byte & 0x7f)
      if (!Number.isSafeInteger(tag) || tag > 16_384) {
        fail()
      }
      if ((byte & 0x80) === 0) {
        break
      }
      if (count === 3) {
        fail()
      }
    }
    if (tag < 31) {
      fail()
    }
  }
  if (offset >= limit) {
    fail()
  }
  const lengthByte = data[offset++]!
  let length = lengthByte
  if (lengthByte & 0x80) {
    const bytes = lengthByte & 0x7f
    if (bytes === 0 || bytes > 4 || offset + bytes > limit || data[offset] === 0) {
      fail()
    }
    length = 0
    for (let index = 0; index < bytes; index++) {
      length = length * 256 + data[offset++]!
    }
    if (length < 128) {
      fail()
    }
  }
  if (length > limit - offset) {
    fail()
  }
  return { data, tagClass, tag, constructed, start, contentStart: offset, end: offset + length }
}

export function children(node: DerNode): DerNode[] {
  if (!node.constructed) {
    fail()
  }
  const result: DerNode[] = []
  let offset = node.contentStart
  while (offset < node.end) {
    if (result.length >= 128) {
      fail()
    }
    const child = readDer(node.data, offset, node.end)
    result.push(child)
    offset = child.end
  }
  if (offset !== node.end) {
    fail()
  }
  return result
}

export function expectDer(node: DerNode, tag: number, tagClass = 0, constructed = false): void {
  if (node.tag !== tag || node.tagClass !== tagClass || node.constructed !== constructed) {
    fail()
  }
}

export function onlyChild(node: DerNode): DerNode {
  const values = children(node)
  if (values.length !== 1) {
    fail()
  }
  return values[0]!
}

export function derBytes(node: DerNode): Buffer {
  return node.data.subarray(node.contentStart, node.end)
}

export function derNumber(node: DerNode, tag = 2): number {
  expectDer(node, tag)
  const bytes = derBytes(node)
  if (bytes.length < 1 || bytes.length > 6 || (bytes[0]! & 0x80) !== 0) {
    fail()
  }
  if (bytes.length > 1 && bytes[0] === 0 && (bytes[1]! & 0x80) === 0) {
    fail()
  }
  let value = 0
  for (const byte of bytes) {
    value = value * 256 + byte
  }
  if (!Number.isSafeInteger(value)) {
    fail()
  }
  return value
}

export function derOid(node: DerNode): string {
  expectDer(node, 6)
  const bytes = derBytes(node)
  if (bytes.length === 0) {
    fail()
  }
  const values: number[] = []
  let value = 0
  let started = false
  for (const byte of bytes) {
    if (!started && byte === 0x80) {
      fail()
    }
    started = true
    value = value * 128 + (byte & 0x7f)
    if (!Number.isSafeInteger(value)) {
      fail()
    }
    if ((byte & 0x80) === 0) {
      values.push(value)
      value = 0
      started = false
    }
  }
  if (started || values.length === 0) {
    fail()
  }
  const first = values.shift()!
  return [
    Math.min(2, Math.floor(first / 40)),
    first < 80 ? first % 40 : first - 80,
    ...values
  ].join('.')
}

export function derRoot(data: Buffer): DerNode {
  const node = readDer(data)
  if (node.end !== data.length) {
    fail()
  }
  return node
}
