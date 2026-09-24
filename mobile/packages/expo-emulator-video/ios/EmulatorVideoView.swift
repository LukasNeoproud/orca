import AVFoundation
import ExpoModulesCore
import UIKit

final class EmulatorVideoView: ExpoView {
  let onRendered = EventDispatcher()
  let onError = EventDispatcher()
  let displayLayer = AVSampleBufferDisplayLayer()
  private var streamId: String?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    displayLayer.videoGravity = .resizeAspect
    layer.addSublayer(displayLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    displayLayer.frame = bounds
  }

  func setStreamId(_ next: String) {
    if streamId == next { return }
    if let streamId { EmulatorVideoSessions.shared.detach(streamId, view: self) }
    streamId = next
    displayLayer.flushAndRemoveImage()
    EmulatorVideoSessions.shared.attach(next, view: self)
  }

  func isCurrentStream(_ value: String) -> Bool { streamId == value }

  func render(_ pixelBuffer: CVPixelBuffer) {
    var description: CMVideoFormatDescription?
    let status = CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescriptionOut: &description
    )
    guard status == noErr, let description else {
      onError(["message": "Video output format unavailable."])
      return
    }
    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: .invalid,
      decodeTimeStamp: .invalid
    )
    var sample: CMSampleBuffer?
    let sampleStatus = CMSampleBufferCreateReadyWithImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescription: description,
      sampleTiming: &timing,
      sampleBufferOut: &sample
    )
    guard sampleStatus == noErr, let sample else {
      onError(["message": "Video output buffer unavailable."])
      return
    }
    if let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true) as? [NSMutableDictionary] {
      attachments.first?[kCMSampleAttachmentKey_DisplayImmediately] = true
    }
    if displayLayer.status == .failed { displayLayer.flush() }
    displayLayer.enqueue(sample)
    onRendered(["width": CVPixelBufferGetWidth(pixelBuffer), "height": CVPixelBufferGetHeight(pixelBuffer)])
  }

  override func removeFromSuperview() {
    if let streamId { EmulatorVideoSessions.shared.detach(streamId, view: self) }
    super.removeFromSuperview()
  }
}
