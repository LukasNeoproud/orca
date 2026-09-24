import AVFoundation
import CoreMedia
import ExpoModulesCore
import VideoToolbox

struct EmulatorEncodedFrame: Record {
  @Field var streamId = ""
  @Field var codec = ""
  @Field var width = 0
  @Field var height = 0
  @Field var seq = 0
  @Field var config = false
  @Field var keyFrame = false
  @Field var timestampUs = 0
  @Field var dataBase64 = ""
}

public final class ExpoEmulatorVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoEmulatorVideo")

    AsyncFunction("getCapabilities") { () -> [String: [String: Bool]] in
      let av1Hardware: Bool
      if #available(iOS 17.0, *) {
        av1Hardware = VTIsHardwareDecodeSupported(kCMVideoCodecType_AV1)
      } else {
        av1Hardware = false
      }
      return [
        "h264": ["supported": true, "hardware": VTIsHardwareDecodeSupported(kCMVideoCodecType_H264)],
        "hevc": ["supported": true, "hardware": VTIsHardwareDecodeSupported(kCMVideoCodecType_HEVC)],
        "av1": ["supported": av1Hardware, "hardware": av1Hardware]
      ]
    }

    AsyncFunction("submit") { (frame: EmulatorEncodedFrame) -> String in
      try EmulatorVideoSessions.shared.submit(frame)
    }

    AsyncFunction("close") { (streamId: String) in
      EmulatorVideoSessions.shared.close(streamId)
    }

    View(EmulatorVideoView.self) {
      Events("onRendered", "onError")
      Prop("streamId") { (view: EmulatorVideoView, streamId: String) in
        view.setStreamId(streamId)
      }
    }

    OnDestroy {
      EmulatorVideoSessions.shared.closeAll()
    }
  }
}
