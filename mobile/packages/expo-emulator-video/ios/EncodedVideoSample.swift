import CoreMedia
import Foundation

enum EncodedVideoSampleError: Error {
  case invalidData
  case missingConfiguration
  case format(OSStatus)
}

enum EncodedVideoSample {
  static func nalUnits(_ data: Data) -> [Data] {
    let bytes = [UInt8](data)
    var starts: [(Int, Int)] = []
    var index = 0
    while index + 3 < bytes.count {
      if bytes[index] == 0 && bytes[index + 1] == 0 {
        if bytes[index + 2] == 1 {
          starts.append((index, 3))
          index += 3
          continue
        }
        if bytes[index + 2] == 0 && bytes[index + 3] == 1 {
          starts.append((index, 4))
          index += 4
          continue
        }
      }
      index += 1
    }
    return starts.enumerated().compactMap { offset, start in
      let end = offset + 1 < starts.count ? starts[offset + 1].0 : bytes.count
      let begin = start.0 + start.1
      return begin < end ? Data(bytes[begin..<end]) : nil
    }
  }

  static func parameterSets(_ data: Data, codec: String) -> [Data] {
    nalUnits(data).filter { unit in
      guard let first = unit.first else { return false }
      if codec == "h264" { return first & 0x1f == 7 || first & 0x1f == 8 }
      let kind = (first >> 1) & 0x3f
      return kind == 32 || kind == 33 || kind == 34
    }
  }

  static func configuration(_ data: Data, codec: String) -> Data? {
    if codec == "av1" { return av1SequenceHeader(data) }
    let sets = parameterSets(data, codec: codec)
    guard !sets.isEmpty else { return nil }
    return sets.reduce(into: Data()) { result, unit in
      result.append(contentsOf: [0, 0, 0, 1])
      result.append(unit)
    }
  }

  static func av1SequenceHeader(_ data: Data) -> Data? {
    let bytes = [UInt8](data)
    if bytes.count > 4 && bytes[0] == 0x81 { return Data(bytes.dropFirst(4)) }
    var offset = 0
    while offset < bytes.count {
      let start = offset
      let header = bytes[offset]
      guard header & 0x80 == 0 else { return nil }
      offset += 1
      if header & 0x04 != 0 { offset += 1 }
      guard offset <= bytes.count else { return nil }
      var length = bytes.count - offset
      if header & 0x02 != 0 {
        length = 0
        var shift = 0
        while true {
          guard offset < bytes.count, shift < 28 else { return nil }
          let value = bytes[offset]
          offset += 1
          length |= Int(value & 0x7f) << shift
          if value & 0x80 == 0 { break }
          shift += 7
        }
      }
      guard length >= 0, offset + length <= bytes.count else { return nil }
      if (header >> 3) & 0x0f == 1 { return Data(bytes[start..<(offset + length)]) }
      offset += length
    }
    return nil
  }

  static func lengthPrefixed(_ data: Data) throws -> Data {
    let units = nalUnits(data)
    guard !units.isEmpty else { throw EncodedVideoSampleError.invalidData }
    var result = Data()
    for unit in units {
      guard unit.count <= Int(UInt32.max) else { throw EncodedVideoSampleError.invalidData }
      var size = UInt32(unit.count).bigEndian
      withUnsafeBytes(of: &size) { result.append(contentsOf: $0) }
      result.append(unit)
    }
    return result
  }

  static func formatDescription(codec: String, width: Int, height: Int, config: Data) throws -> CMVideoFormatDescription {
    if codec == "av1" {
      guard config.count > 0 else { throw EncodedVideoSampleError.missingConfiguration }
      var description: CMFormatDescription?
      let av1C = try AV1ConfigurationRecord.make(sequence: config)
      let extensions = [kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms as String: ["av1C": av1C]] as CFDictionary
      let status = CMVideoFormatDescriptionCreate(
        allocator: kCFAllocatorDefault,
        codecType: kCMVideoCodecType_AV1,
        width: Int32(width),
        height: Int32(height),
        extensions: extensions,
        formatDescriptionOut: &description
      )
      guard status == noErr, let description else { throw EncodedVideoSampleError.format(status) }
      return description
    }

    let sets = parameterSets(config, codec: codec)
    let types = sets.compactMap { unit -> Int? in
      guard let first = unit.first else { return nil }
      return codec == "h264" ? Int(first & 0x1f) : Int((first >> 1) & 0x3f)
    }
    let needed = codec == "h264" ? [7, 8] : [32, 33, 34]
    guard needed.allSatisfy(types.contains) else { throw EncodedVideoSampleError.missingConfiguration }

    let allocations: [UnsafeMutablePointer<UInt8>] = sets.map { unit in
      let pointer = UnsafeMutablePointer<UInt8>.allocate(capacity: unit.count)
      unit.copyBytes(to: pointer, count: unit.count)
      return pointer
    }
    defer { allocations.forEach { $0.deallocate() } }
    let pointers = allocations.map { UnsafePointer($0) }
    let sizes = sets.map(\.count)
    var description: CMFormatDescription?
    let status = pointers.withUnsafeBufferPointer { pointerBuffer in
      sizes.withUnsafeBufferPointer { sizeBuffer in
        if codec == "h264" {
          return CMVideoFormatDescriptionCreateFromH264ParameterSets(
            allocator: kCFAllocatorDefault,
            parameterSetCount: sets.count,
            parameterSetPointers: pointerBuffer.baseAddress!,
            parameterSetSizes: sizeBuffer.baseAddress!,
            nalUnitHeaderLength: 4,
            formatDescriptionOut: &description
          )
        }
        return CMVideoFormatDescriptionCreateFromHEVCParameterSets(
          allocator: kCFAllocatorDefault,
          parameterSetCount: sets.count,
          parameterSetPointers: pointerBuffer.baseAddress!,
          parameterSetSizes: sizeBuffer.baseAddress!,
          nalUnitHeaderLength: 4,
          extensions: nil,
          formatDescriptionOut: &description
        )
      }
    }
    guard status == noErr, let description else { throw EncodedVideoSampleError.format(status) }
    return description
  }

  static func sampleBuffer(data: Data, format: CMVideoFormatDescription, timestampUs: Int64) throws -> CMSampleBuffer {
    var block: CMBlockBuffer?
    var status = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault,
      memoryBlock: nil,
      blockLength: data.count,
      blockAllocator: kCFAllocatorDefault,
      customBlockSource: nil,
      offsetToData: 0,
      dataLength: data.count,
      flags: 0,
      blockBufferOut: &block
    )
    guard status == noErr, let block else { throw EncodedVideoSampleError.format(status) }
    status = data.withUnsafeBytes { raw in
      CMBlockBufferReplaceDataBytes(
        with: raw.baseAddress!,
        blockBuffer: block,
        offsetIntoDestination: 0,
        dataLength: data.count
      )
    }
    guard status == noErr else { throw EncodedVideoSampleError.format(status) }
    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: CMTime(value: timestampUs, timescale: 1_000_000),
      decodeTimeStamp: .invalid
    )
    var size = data.count
    var sample: CMSampleBuffer?
    status = CMSampleBufferCreateReady(
      allocator: kCFAllocatorDefault,
      dataBuffer: block,
      formatDescription: format,
      sampleCount: 1,
      sampleTimingEntryCount: 1,
      sampleTimingArray: &timing,
      sampleSizeEntryCount: 1,
      sampleSizeArray: &size,
      sampleBufferOut: &sample
    )
    guard status == noErr, let sample else { throw EncodedVideoSampleError.format(status) }
    return sample
  }
}
