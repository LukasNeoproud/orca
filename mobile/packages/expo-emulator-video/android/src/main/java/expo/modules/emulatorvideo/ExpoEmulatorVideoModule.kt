package expo.modules.emulatorvideo

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoEmulatorVideoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoEmulatorVideo")

    AsyncFunction("getCapabilities") { promise: Promise ->
      val result = listOf("h264", "hevc", "av1").associateWith { codec ->
        val decoders = decoderInfos(codec)
        mapOf("supported" to decoders.isNotEmpty(), "hardware" to decoders.any(::isHardware))
      }
      promise.resolve(result)
    }

    AsyncFunction("submit") { frame: Map<String, Any>, promise: Promise ->
      val streamId = frame["streamId"] as? String
      val codec = frame["codec"] as? String
      val encoded = frame["dataBase64"] as? String
      if (streamId == null || codec == null || encoded == null) {
        promise.reject("INVALID_FRAME", "Missing encoded video frame fields", null)
        return@AsyncFunction
      }
      val bytes = try {
        Base64.decode(encoded, Base64.DEFAULT)
      } catch (error: IllegalArgumentException) {
        promise.reject("INVALID_FRAME", "Invalid base64 video frame", error)
        return@AsyncFunction
      }
      VideoSessions.submit(
        EncodedFrame(
          streamId = streamId,
          codec = codec,
          width = (frame["width"] as? Number)?.toInt() ?: 0,
          height = (frame["height"] as? Number)?.toInt() ?: 0,
          seq = (frame["seq"] as? Number)?.toLong() ?: 0,
          config = frame["config"] as? Boolean ?: false,
          keyFrame = frame["keyFrame"] as? Boolean ?: false,
          timestampUs = (frame["timestampUs"] as? Number)?.toLong() ?: 0,
          data = bytes
        ),
        promise
      )
    }

    AsyncFunction("close") { streamId: String, promise: Promise ->
      VideoSessions.close(streamId, promise)
    }

    View(EmulatorVideoView::class) {
      Events("onRendered", "onError")
      Prop("streamId") { view: EmulatorVideoView, streamId: String ->
        view.setStreamId(streamId)
      }
    }

    OnDestroy {
      VideoSessions.closeAll()
    }
  }
}

internal fun videoMime(codec: String): String? = when (codec) {
  "h264" -> "video/avc"
  "hevc" -> "video/hevc"
  "av1" -> "video/av01"
  else -> null
}

internal fun decoderInfos(codec: String): List<MediaCodecInfo> {
  val mime = videoMime(codec) ?: return emptyList()
  return MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter { info ->
    if (info.isEncoder || info.name.endsWith(".secure")) return@filter false
    if (info.supportedTypes.none { it.equals(mime, ignoreCase = true) }) return@filter false
    try {
      val capabilities = info.getCapabilitiesForType(mime)
      !capabilities.isFeatureRequired(MediaCodecInfo.CodecCapabilities.FEATURE_SecurePlayback) &&
        !capabilities.isFeatureRequired(MediaCodecInfo.CodecCapabilities.FEATURE_TunneledPlayback)
    } catch (_: Exception) { false }
  }.sortedByDescending(::isHardware)
}

private fun isHardware(info: MediaCodecInfo): Boolean = if (Build.VERSION.SDK_INT >= 29) {
  info.isHardwareAccelerated
} else {
  !info.name.startsWith("OMX.google.") && !info.name.startsWith("c2.android.")
}
