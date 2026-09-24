package expo.modules.emulatorvideo

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import expo.modules.kotlin.Promise
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

internal data class EncodedFrame(
  val streamId: String,
  val codec: String,
  val width: Int,
  val height: Int,
  val seq: Long,
  val config: Boolean,
  val keyFrame: Boolean,
  val timestampUs: Long,
  val data: ByteArray
)

internal object VideoSessions {
  private val worker = ScheduledThreadPoolExecutor(1) { task ->
    Thread(task, "orca-emulator-video").apply { isDaemon = true }
  }.apply { removeOnCancelPolicy = true }
  private val queued = AtomicInteger()
  private val sessions = mutableMapOf<String, VideoSession>()
  private val closedIds = ArrayDeque<String>()
  private val closedSet = mutableSetOf<String>()

  private fun rememberClosed(streamId: String) {
    if (closedSet.add(streamId)) closedIds.addLast(streamId)
    if (closedIds.size > 512) closedSet.remove(closedIds.removeFirst())
  }

  fun attach(streamId: String, view: EmulatorVideoView, surface: Surface) {
    worker.execute {
      if (streamId in closedSet) return@execute
      val session = sessions.getOrPut(streamId) { VideoSession(streamId) }
      session.attach(view, surface)
    }
  }

  fun detach(streamId: String, view: EmulatorVideoView) {
    worker.execute { sessions[streamId]?.detach(view) }
  }

  fun submit(frame: EncodedFrame, promise: Promise) {
    if (frame.width !in 1..16384 || frame.height !in 1..16384 || frame.data.size !in 1..8_388_608) {
      promise.reject("INVALID_FRAME", "Invalid encoded video frame dimensions or size", null)
      return
    }
    if (queued.incrementAndGet() > 3) {
      queued.decrementAndGet()
      worker.execute { sessions[frame.streamId]?.loseSync() }
      promise.resolve("dropped")
      return
    }
    worker.execute {
      try {
        if (frame.streamId in closedSet) {
          promise.resolve("dropped")
          return@execute
        }
        val session = sessions.getOrPut(frame.streamId) { VideoSession(frame.streamId) }
        promise.resolve(session.submit(frame))
      } catch (error: Exception) {
        sessions.remove(frame.streamId)?.close()
        promise.reject("DECODE_FAILED", error.message ?: "Video decoder failed", error)
      } finally {
        queued.decrementAndGet()
      }
    }
  }

  fun close(streamId: String, promise: Promise) {
    worker.execute {
      rememberClosed(streamId)
      sessions.remove(streamId)?.close()
      promise.resolve(null)
    }
  }

  fun closeAll() {
    worker.execute {
      sessions.keys.forEach(::rememberClosed)
      sessions.values.forEach(VideoSession::close)
      sessions.clear()
    }
  }

  fun schedule(delayMs: Long, action: () -> Unit) {
    worker.schedule(action, delayMs, TimeUnit.MILLISECONDS)
  }
}

private class VideoSession(private val streamId: String) {
  private var view: EmulatorVideoView? = null
  private var surface: Surface? = null
  private var decoder: MediaCodec? = null
  private var codecName: String? = null
  private var width = 0
  private var height = 0
  private var outputWidth = 0
  private var outputHeight = 0
  private var lastSeq: Long? = null
  private var configBytes: ByteArray? = null
  private var awaitingKeyframe = true
  private var needsConfig = false
  private var rendered = false
  private val pending = ArrayDeque<EncodedFrame>()
  private var pendingBytes = 0
  private var pendingOutput = 0
  private var drainScheduled = false
  private var drainDeadline = 0L

  fun attach(nextView: EmulatorVideoView, nextSurface: Surface) {
    if (view === nextView && surface === nextSurface) return
    closeDecoder()
    view = nextView
    surface = nextSurface
    awaitingKeyframe = true
    needsConfig = true
    rendered = false
    val replay = pending.toList()
    pending.clear()
    pendingBytes = 0
    replay.forEach(::decode)
  }

  fun detach(currentView: EmulatorVideoView) {
    if (view !== currentView) return
    closeDecoder()
    view = null
    surface = null
    awaitingKeyframe = true
    needsConfig = true
  }

  fun loseSync() {
    awaitingKeyframe = true
    needsConfig = true
    pending.clear()
    pendingBytes = 0
    pendingOutput = 0
    decoder?.flush()
  }

  fun submit(frame: EncodedFrame): String {
    if (frame.streamId != streamId) return "dropped"
    videoMime(frame.codec) ?: throw IllegalArgumentException("Unsupported video codec")
    if (lastSeq != null && frame.seq != lastSeq!! + 1L) loseSync()
    lastSeq = frame.seq
    if (codecName != frame.codec || width != frame.width || height != frame.height) {
      closeDecoder()
      codecName = frame.codec
      width = frame.width
      height = frame.height
      awaitingKeyframe = true
      needsConfig = true
      rendered = false
      configBytes = null
    }
    if (frame.config) {
      if (configBytes != null && !configBytes!!.contentEquals(frame.data)) {
        closeDecoder()
        awaitingKeyframe = true
      }
      configBytes = frame.data
      needsConfig = true
      return "queued"
    }
    if (awaitingKeyframe && !frame.keyFrame) return "waiting-for-keyframe"
    if (surface == null) {
      if (frame.keyFrame) {
        pending.clear()
        pendingBytes = 0
      }
      if (pending.size >= 128 || pendingBytes + frame.data.size > 8_388_608) {
        pending.clear()
        pendingBytes = 0
        awaitingKeyframe = true
        return "dropped"
      }
      pending.addLast(frame)
      pendingBytes += frame.data.size
      awaitingKeyframe = false
      return "queued"
    }
    return decode(frame)
  }

  private fun decode(frame: EncodedFrame): String {
    val target = surface ?: return "waiting-for-keyframe"
    val mime = videoMime(frame.codec) ?: throw IllegalArgumentException("Unsupported video codec")
    val freshDecoder = decoder == null
    if (decoder == null) {
      var lastError: Exception? = null
      for (info in decoderInfos(frame.codec)) {
        val supportsSize = try {
          info.getCapabilitiesForType(mime).videoCapabilities?.isSizeSupported(width, height) == true
        } catch (_: Exception) { false }
        if (!supportsSize) continue
        var instance: MediaCodec? = null
        try {
          instance = MediaCodec.createByCodecName(info.name)
          instance.configure(MediaFormat.createVideoFormat(mime, width, height), target, null, 0)
          instance.start()
          decoder = instance
          needsConfig = true
          break
        } catch (error: Exception) {
          lastError = error
          instance?.release()
        }
      }
      if (decoder == null) throw lastError ?: IllegalStateException("No decoder for ${frame.codec} at ${width}x$height")
    }
    val instance = decoder ?: return "waiting-for-keyframe"
    if (awaitingKeyframe && frame.keyFrame) {
      if (!freshDecoder) instance.flush()
      awaitingKeyframe = false
    }
    if (needsConfig) {
      if (configBytes?.let { queue(instance, it, frame.timestampUs, MediaCodec.BUFFER_FLAG_CODEC_CONFIG) } == false) {
        loseSync()
        return "dropped"
      }
      needsConfig = false
    }
    if (!queue(instance, frame.data, frame.timestampUs, 0)) {
      loseSync()
      return "dropped"
    }
    pendingOutput++
    drainDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
    drain(instance)
    scheduleDrain(instance)
    return "queued"
  }

  private fun queue(codec: MediaCodec, bytes: ByteArray, timestampUs: Long, flags: Int): Boolean {
    val index = codec.dequeueInputBuffer(5_000)
    if (index < 0) return false
    val buffer = codec.getInputBuffer(index) ?: return false
    if (bytes.size > buffer.capacity()) throw IllegalStateException("Encoded frame exceeds decoder input buffer")
    buffer.clear()
    buffer.put(bytes)
    codec.queueInputBuffer(index, 0, bytes.size, timestampUs, flags)
    return true
  }

  private fun drain(codec: MediaCodec) {
    val info = MediaCodec.BufferInfo()
    while (true) {
      val index = codec.dequeueOutputBuffer(info, 0)
      when {
        index >= 0 -> {
          codec.releaseOutputBuffer(index, true)
          if (pendingOutput > 0) pendingOutput--
          if (!rendered) {
            rendered = true
            view?.rendered(streamId, outputWidth.takeIf { it > 0 } ?: width, outputHeight.takeIf { it > 0 } ?: height)
          }
        }
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          val format = codec.outputFormat
          outputWidth = if (format.containsKey("crop-left") && format.containsKey("crop-right")) {
            format.getInteger("crop-right") - format.getInteger("crop-left") + 1
          } else format.getInteger(MediaFormat.KEY_WIDTH)
          outputHeight = if (format.containsKey("crop-top") && format.containsKey("crop-bottom")) {
            format.getInteger("crop-bottom") - format.getInteger("crop-top") + 1
          } else format.getInteger(MediaFormat.KEY_HEIGHT)
          if (rendered) view?.rendered(streamId, outputWidth, outputHeight)
        }
        else -> return
      }
    }
  }

  private fun scheduleDrain(instance: MediaCodec) {
    if (pendingOutput == 0 || drainScheduled) return
    drainScheduled = true
    VideoSessions.schedule(10) {
      drainScheduled = false
      if (decoder !== instance) return@schedule
      try {
        drain(instance)
        if (pendingOutput > 0 && System.nanoTime() < drainDeadline) {
          scheduleDrain(instance)
        } else if (pendingOutput > 0) {
          view?.error(streamId, "Video decoder produced no frame.")
          loseSync()
        }
      } catch (error: Exception) {
        view?.error(streamId, error.message ?: "Video decoder failed")
        closeDecoder()
        awaitingKeyframe = true
      }
    }
  }

  private fun closeDecoder() {
    val instance = decoder ?: return
    decoder = null
    pendingOutput = 0
    drainScheduled = false
    try { instance.stop() } catch (_: Exception) { }
    instance.release()
  }

  fun close() {
    closeDecoder()
    view = null
    surface = null
    configBytes = null
    pending.clear()
    pendingBytes = 0
  }
}
