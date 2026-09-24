import CoreMedia
import ExpoModulesCore
import Foundation
import VideoToolbox

private enum VideoSessionError: Error {
  case invalidFrame
  case unsupportedCodec
  case decoder(OSStatus)
}

final class EmulatorVideoSessions {
  static let shared = EmulatorVideoSessions()
  private let queue = DispatchQueue(label: "orca.emulator.video", qos: .userInitiated)
  private var sessions: [String: VideoSession] = [:]
  private var closedIds: [String] = []
  private var closedSet = Set<String>()

  private func rememberClosed(_ streamId: String) {
    if closedSet.insert(streamId).inserted { closedIds.append(streamId) }
    if closedIds.count > 512 { closedSet.remove(closedIds.removeFirst()) }
  }

  func attach(_ streamId: String, view: EmulatorVideoView) {
    queue.async {
      if self.closedSet.contains(streamId) { return }
      let session = self.sessions[streamId] ?? VideoSession(streamId: streamId)
      self.sessions[streamId] = session
      session.attach(view)
    }
  }

  func detach(_ streamId: String, view: EmulatorVideoView) {
    queue.async { self.sessions[streamId]?.detach(view) }
  }

  func submit(_ frame: EmulatorEncodedFrame) throws -> String {
    guard let data = Data(base64Encoded: frame.dataBase64),
          !data.isEmpty, data.count <= 8_388_608,
          (1...16384).contains(frame.width), (1...16384).contains(frame.height) else {
      throw VideoSessionError.invalidFrame
    }
    return try queue.sync {
      if closedSet.contains(frame.streamId) { return "dropped" }
      let session = sessions[frame.streamId] ?? VideoSession(streamId: frame.streamId)
      sessions[frame.streamId] = session
      return try session.submit(frame, data: data)
    }
  }

  func close(_ streamId: String) {
    queue.async {
      self.rememberClosed(streamId)
      self.sessions.removeValue(forKey: streamId)?.close()
    }
  }

  func closeAll() {
    queue.async {
      self.sessions.keys.forEach(self.rememberClosed)
      self.sessions.values.forEach { $0.close() }
      self.sessions.removeAll()
    }
  }
}

private final class VideoSession {
  private let streamId: String
  private weak var view: EmulatorVideoView?
  private var decoder: VTDecompressionSession?
  private var format: CMVideoFormatDescription?
  private var codec = ""
  private var width = 0
  private var height = 0
  private var lastSeq: Int?
  private var configBytes: Data?
  private var awaitingKeyframe = true
  private var pending: [(EmulatorEncodedFrame, Data)] = []
  private var pendingBytes = 0

  init(streamId: String) { self.streamId = streamId }

  func attach(_ view: EmulatorVideoView) {
    if self.view === view { return }
    closeDecoder()
    self.view = view
    awaitingKeyframe = true
    let replay = pending
    pending.removeAll()
    pendingBytes = 0
    for (frame, data) in replay {
      do { try decode(frame, data: data) }
      catch { report(error) }
    }
  }

  func detach(_ view: EmulatorVideoView) {
    guard self.view === view else { return }
    closeDecoder()
    self.view = nil
    awaitingKeyframe = true
  }

  func submit(_ frame: EmulatorEncodedFrame, data: Data) throws -> String {
    guard ["h264", "hevc", "av1"].contains(frame.codec) else { throw VideoSessionError.unsupportedCodec }
    if let lastSeq, frame.seq != lastSeq + 1 { loseSync() }
    lastSeq = frame.seq
    if codec != frame.codec || width != frame.width || height != frame.height {
      closeDecoder()
      codec = frame.codec
      width = frame.width
      height = frame.height
      configBytes = nil
      awaitingKeyframe = true
      pending.removeAll()
      pendingBytes = 0
    }
    if frame.config {
      guard let configuration = EncodedVideoSample.configuration(data, codec: codec) else {
        throw VideoSessionError.invalidFrame
      }
      if configBytes != configuration {
        closeDecoder()
        awaitingKeyframe = true
        pending.removeAll()
        pendingBytes = 0
      }
      configBytes = configuration
      return "queued"
    }
    if awaitingKeyframe && !frame.keyFrame { return "waiting-for-keyframe" }
    guard view != nil else {
      if frame.keyFrame {
        pending.removeAll()
        pendingBytes = 0
      }
      if pending.count >= 128 || pendingBytes + data.count > 8_388_608 {
        pending.removeAll()
        pendingBytes = 0
        awaitingKeyframe = true
        return "dropped"
      }
      pending.append((frame, data))
      pendingBytes += data.count
      awaitingKeyframe = false
      return "queued"
    }
    try decode(frame, data: data)
    return "queued"
  }

  private func decode(_ frame: EmulatorEncodedFrame, data: Data) throws {
    if awaitingKeyframe && !frame.keyFrame { return }
    if frame.keyFrame, let inline = EncodedVideoSample.configuration(data, codec: codec) {
      if configBytes != inline {
        closeDecoder()
        configBytes = inline
      }
    }
    if decoder == nil {
      let config = configBytes ?? (frame.keyFrame ? data : Data())
      let description = try EncodedVideoSample.formatDescription(
        codec: codec, width: width, height: height, config: config
      )
      var session: VTDecompressionSession?
      let specification = [kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder: true] as CFDictionary
      let status = VTDecompressionSessionCreate(
        allocator: kCFAllocatorDefault,
        formatDescription: description,
        decoderSpecification: specification,
        imageBufferAttributes: nil,
        outputCallback: nil,
        decompressionSessionOut: &session
      )
      guard status == noErr, let session else { throw VideoSessionError.decoder(status) }
      decoder = session
      format = description
    }
    awaitingKeyframe = false
    let payload = codec == "av1" ? data : try EncodedVideoSample.lengthPrefixed(data)
    let sample = try EncodedVideoSample.sampleBuffer(
      data: payload, format: format!, timestampUs: Int64(frame.timestampUs)
    )
    let targetView = view
    let expectedStream = streamId
    let status = VTDecompressionSessionDecodeFrame(
      decoder!, sampleBuffer: sample, flags: [], infoFlagsOut: nil
    ) { status, _, image, _, _ in
      guard status == noErr, let image else {
        DispatchQueue.main.async {
          if targetView?.isCurrentStream(expectedStream) == true {
            targetView?.onError(["message": "VideoToolbox could not decode a frame."])
          }
        }
        return
      }
      DispatchQueue.main.async {
        if targetView?.isCurrentStream(expectedStream) == true {
          targetView?.render(image)
        }
      }
    }
    guard status == noErr else { throw VideoSessionError.decoder(status) }
  }

  private func loseSync() {
    closeDecoder()
    pending.removeAll()
    pendingBytes = 0
    awaitingKeyframe = true
  }

  private func report(_ error: Error) {
    let target = view
    let expectedStream = streamId
    DispatchQueue.main.async {
      if target?.isCurrentStream(expectedStream) == true {
        target?.onError(["message": "Video decoder failed: \(error.localizedDescription)"])
      }
    }
  }

  private func closeDecoder() {
    if let decoder { VTDecompressionSessionInvalidate(decoder) }
    decoder = nil
    format = nil
  }

  func close() {
    closeDecoder()
    view = nil
    configBytes = nil
    pending.removeAll()
  }
}
