import CoreMedia
import CoreVideo
import Foundation
import VideoToolbox

private final class DecodeResult {
  var status: OSStatus = -1
  var image: CVImageBuffer?
}

private func assertRed(_ image: CVImageBuffer, codec: String, expectedWidth: Int, expectedHeight: Int) throws {
  let buffer = image as CVPixelBuffer
  let width = CVPixelBufferGetWidth(buffer)
  let height = CVPixelBufferGetHeight(buffer)
  guard width == expectedWidth && height == expectedHeight else {
    throw SmokeError.failed("\(codec): decoded \(width)x\(height), expected \(expectedWidth)x\(expectedHeight)")
  }
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  guard CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_32BGRA,
        let base = CVPixelBufferGetBaseAddress(buffer) else {
    throw SmokeError.failed("\(codec): decoder did not provide BGRA pixels")
  }
  let bytes = base.assumingMemoryBound(to: UInt8.self)
  let offset = (height / 2) * CVPixelBufferGetBytesPerRow(buffer) + (width / 2) * 4
  let blue = Int(bytes[offset])
  let green = Int(bytes[offset + 1])
  let red = Int(bytes[offset + 2])
  guard red > 120 && red > green * 2 && red > blue * 2 else {
    throw SmokeError.failed("\(codec): center pixel is not red (R=\(red) G=\(green) B=\(blue))")
  }
  print("PASS \(codec) \(width)x\(height) center RGB=\(red),\(green),\(blue)")
}

private enum SmokeError: Error {
  case failed(String)
  case decoderCreate(String, OSStatus)
}

private func smoke(codec: String, fixture: URL, width: Int, height: Int) throws {
  let data = try Data(contentsOf: fixture)
  guard let configuration = EncodedVideoSample.configuration(data, codec: codec) else {
    throw SmokeError.failed("\(codec): keyframe has no decoder configuration")
  }
  if codec == "av1" {
    let av1C = try AV1ConfigurationRecord.make(sequence: configuration)
    print("AV1 av1C \(av1C.map { String(format: "%02x", $0) }.joined())")
  }
  let format = try EncodedVideoSample.formatDescription(
    codec: codec, width: width, height: height, config: configuration
  )
  let encoded = codec == "av1" ? data : try EncodedVideoSample.lengthPrefixed(data)
  let sample = try EncodedVideoSample.sampleBuffer(
    data: encoded, format: format, timestampUs: 1_000_000
  )
  let specification = [kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder: true] as CFDictionary
  let attributes = [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)] as CFDictionary
  var session: VTDecompressionSession?
  let createStatus = VTDecompressionSessionCreate(
    allocator: kCFAllocatorDefault,
    formatDescription: format,
    decoderSpecification: codec == "av1" ? nil : specification,
    imageBufferAttributes: attributes,
    outputCallback: nil,
    decompressionSessionOut: &session
  )
  guard createStatus == noErr, let session else {
    throw SmokeError.decoderCreate(codec, createStatus)
  }
  defer { VTDecompressionSessionInvalidate(session) }
  let result = DecodeResult()
  let decodeStatus = VTDecompressionSessionDecodeFrame(
    session, sampleBuffer: sample, flags: [], infoFlagsOut: nil
  ) { status, _, image, _, _ in
    result.status = status
    result.image = image
  }
  guard decodeStatus == noErr else {
    throw SmokeError.failed("\(codec): VTDecompressionSessionDecodeFrame status \(decodeStatus)")
  }
  let waitStatus = VTDecompressionSessionWaitForAsynchronousFrames(session)
  guard waitStatus == noErr else {
    throw SmokeError.failed("\(codec): VTDecompressionSessionWaitForAsynchronousFrames status \(waitStatus)")
  }
  guard result.status == noErr, let image = result.image else {
    throw SmokeError.failed("\(codec): callback status \(result.status), image missing: \(result.image == nil)")
  }
  try assertRed(image, codec: codec, expectedWidth: width, expectedHeight: height)
}

guard CommandLine.arguments.count == 2 else {
  fputs("usage: emulator-video-toolbox-smoke <fixture-directory>\n", stderr)
  exit(2)
}
let fixtures = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
var failed = false
for codec in ["h264", "hevc", "av1"] {
  if codec == "av1" && !VTIsHardwareDecodeSupported(kCMVideoCodecType_AV1) {
    print("SKIP av1: hardware VideoToolbox decode unsupported on this Mac")
    continue
  }
  do {
    try smoke(codec: codec, fixture: fixtures.appendingPathComponent("\(codec).bin"), width: 64, height: 48)
  } catch SmokeError.decoderCreate("av1", -12911) {
    // Current Apple AV1 hardware rejects 64x48; verify the same parser at a normal size.
    do {
      try smoke(codec: "av1", fixture: fixtures.appendingPathComponent("av1-640x480.bin"), width: 640, height: 480)
      print("SKIP av1 64x48: hardware rejected this small frame (VT status -12911)")
    } catch {
      failed = true
      fputs("FAIL av1 normal-size control: \(error)\n", stderr)
    }
  } catch {
    failed = true
    fputs("FAIL \(codec): \(error)\n", stderr)
  }
}
if failed { exit(1) }
