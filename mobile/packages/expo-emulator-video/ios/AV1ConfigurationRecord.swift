import Foundation

private struct AV1Bits {
  let bytes: [UInt8]
  var offset = 0

  mutating func read(_ count: Int) throws -> Int {
    guard count >= 0, count <= 32, offset + count <= bytes.count * 8 else {
      throw EncodedVideoSampleError.invalidData
    }
    var value = 0
    for _ in 0..<count {
      value = (value << 1) | Int((bytes[offset / 8] >> (7 - offset % 8)) & 1)
      offset += 1
    }
    return value
  }

  mutating func uvlc() throws {
    var zeros = 0
    while try read(1) == 0 {
      zeros += 1
      if zeros > 31 { throw EncodedVideoSampleError.invalidData }
    }
    _ = try read(zeros)
  }
}

enum AV1ConfigurationRecord {
  static func make(sequence: Data) throws -> Data {
    let bytes = [UInt8](sequence)
    guard bytes.count >= 3, (bytes[0] >> 3) & 0x0f == 1 else {
      throw EncodedVideoSampleError.invalidData
    }
    var index = 1 + (bytes[0] & 0x04 != 0 ? 1 : 0)
    guard bytes[0] & 0x02 != 0 else { throw EncodedVideoSampleError.invalidData }
    var size = 0
    var shift = 0
    while true {
      guard index < bytes.count, shift < 28 else { throw EncodedVideoSampleError.invalidData }
      let byte = bytes[index]
      index += 1
      size |= Int(byte & 0x7f) << shift
      if byte & 0x80 == 0 { break }
      shift += 7
    }
    guard size > 0, index + size <= bytes.count else { throw EncodedVideoSampleError.invalidData }
    var bits = AV1Bits(bytes: Array(bytes[index..<(index + size)]))
    let profile = try bits.read(3)
    _ = try bits.read(1)
    let reduced = try bits.read(1) == 1
    var level = 0
    var tier = 0
    if reduced {
      level = try bits.read(5)
    } else {
      let timing = try bits.read(1) == 1
      var decoderModel = false
      var bufferDelayBits = 0
      if timing {
        _ = try bits.read(32)
        _ = try bits.read(32)
        if try bits.read(1) == 1 { try bits.uvlc() }
        decoderModel = try bits.read(1) == 1
        if decoderModel {
          bufferDelayBits = try bits.read(5) + 1
          _ = try bits.read(32)
          _ = try bits.read(5)
          _ = try bits.read(5)
        }
      }
      let initialDelay = try bits.read(1) == 1
      let operatingPoints = try bits.read(5) + 1
      for point in 0..<operatingPoints {
        _ = try bits.read(12)
        let pointLevel = try bits.read(5)
        let pointTier = pointLevel > 7 ? try bits.read(1) : 0
        if point == 0 {
          level = pointLevel
          tier = pointTier
        }
        if decoderModel {
          if try bits.read(1) == 1 {
            _ = try bits.read(bufferDelayBits)
            _ = try bits.read(bufferDelayBits)
            _ = try bits.read(1)
          }
        }
        if initialDelay {
          if try bits.read(1) == 1 { _ = try bits.read(4) }
        }
      }
    }
    let widthBits = try bits.read(4) + 1
    let heightBits = try bits.read(4) + 1
    _ = try bits.read(widthBits)
    _ = try bits.read(heightBits)
    if !reduced {
      if try bits.read(1) == 1 {
        _ = try bits.read(4)
        _ = try bits.read(3)
      }
    }
    _ = try bits.read(3)
    if !reduced {
      _ = try bits.read(4)
      let orderHint = try bits.read(1) == 1
      if orderHint { _ = try bits.read(2) }
      let chooseScreen = try bits.read(1) == 1
      let screen = chooseScreen ? 2 : try bits.read(1)
      if screen > 0 {
        if try bits.read(1) == 0 { _ = try bits.read(1) }
      }
      if orderHint { _ = try bits.read(3) }
    }
    _ = try bits.read(3)
    let high = try bits.read(1)
    let twelve = profile == 2 && high == 1 ? try bits.read(1) : 0
    let bitDepth = high == 0 ? 8 : (twelve == 1 ? 12 : 10)
    let mono = profile == 1 ? 0 : try bits.read(1)
    var primaries = 2
    var transfer = 2
    var matrix = 2
    if try bits.read(1) == 1 {
      primaries = try bits.read(8)
      transfer = try bits.read(8)
      matrix = try bits.read(8)
    }
    var subsamplingX = 0
    var subsamplingY = 0
    var position = 0
    if mono == 1 {
      _ = try bits.read(1)
      subsamplingX = 1
      subsamplingY = 1
    } else if !(primaries == 1 && transfer == 13 && matrix == 0) {
      _ = try bits.read(1)
      if profile == 0 {
        subsamplingX = 1
        subsamplingY = 1
      } else if profile == 2 {
        if bitDepth == 12 {
          subsamplingX = try bits.read(1)
          if subsamplingX == 1 { subsamplingY = try bits.read(1) }
        } else {
          subsamplingX = 1
        }
      }
      if subsamplingX == 1 && subsamplingY == 1 { position = try bits.read(2) }
    }
    let header = Data([
      0x81,
      UInt8((profile << 5) | level),
      UInt8((tier << 7) | (high << 6) | (twelve << 5) | (mono << 4)
        | (subsamplingX << 3) | (subsamplingY << 2) | position),
      0
    ])
    return header + sequence
  }
}
