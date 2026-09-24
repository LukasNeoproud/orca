package expo.modules.emulatorvideo

import android.content.Context
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class EmulatorVideoView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onRendered by EventDispatcher()
  private val onError by EventDispatcher()
  private var streamId: String? = null
  private var surface: Surface? = null
  private var videoWidth = 0
  private var videoHeight = 0
  private val texture = TextureView(context).also { textureView ->
    textureView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        surface = Surface(surfaceTexture)
        streamId?.let { VideoSessions.attach(it, this@EmulatorVideoView, surface!!) }
      }

      override fun onSurfaceTextureSizeChanged(surfaceTexture: SurfaceTexture, width: Int, height: Int) = Unit
      override fun onSurfaceTextureUpdated(surfaceTexture: SurfaceTexture) = Unit

      override fun onSurfaceTextureDestroyed(surfaceTexture: SurfaceTexture): Boolean {
        streamId?.let { VideoSessions.detach(it, this@EmulatorVideoView) }
        surface?.release()
        surface = null
        return true
      }
    }
    addView(textureView)
  }

  fun setStreamId(next: String) {
    if (streamId == next) return
    streamId?.let { VideoSessions.detach(it, this) }
    streamId = next
    videoWidth = 0
    videoHeight = 0
    surface?.let { VideoSessions.attach(next, this, it) }
  }

  internal fun rendered(owner: String, width: Int, height: Int) {
    post {
      if (streamId != owner) return@post
      videoWidth = width
      videoHeight = height
      fitVideo()
      onRendered(mapOf("width" to width, "height" to height))
    }
  }

  internal fun error(owner: String, message: String) {
    post {
      if (streamId == owner) onError(mapOf("message" to message))
    }
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    fitVideo()
  }

  private fun fitVideo() {
    if (width <= 0 || height <= 0 || videoWidth <= 0 || videoHeight <= 0) return
    val displayRatio = width.toFloat() / height
    val videoRatio = videoWidth.toFloat() / videoHeight
    val xScale = if (videoRatio > displayRatio) 1f else videoRatio / displayRatio
    val yScale = if (videoRatio > displayRatio) displayRatio / videoRatio else 1f
    texture.setTransform(Matrix().apply { setScale(xScale, yScale, width / 2f, height / 2f) })
  }

  override fun onDetachedFromWindow() {
    streamId?.let { VideoSessions.detach(it, this) }
    super.onDetachedFromWindow()
  }
}
