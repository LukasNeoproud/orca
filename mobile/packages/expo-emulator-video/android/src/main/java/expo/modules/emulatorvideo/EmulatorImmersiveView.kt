package expo.modules.emulatorvideo

import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

// This view controls its own window, including a React Native Modal's separate dialog.
class EmulatorImmersiveView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var attachmentGeneration = 0
  private var controller: WindowInsetsController? = null
  private var previousBehavior = 0
  private var previousVisibleTypes = 0
  private var legacyRoot: View? = null
  private var previousFlags = 0

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val generation = ++attachmentGeneration
    post {
      if (generation != attachmentGeneration || !isAttachedToWindow) return@post
      if (Build.VERSION.SDK_INT >= 30) {
        controller = windowInsetsController
        previousBehavior = controller?.systemBarsBehavior ?: 0
        val insets = rootWindowInsets
        previousVisibleTypes = 0
        for (type in listOf(WindowInsets.Type.statusBars(), WindowInsets.Type.navigationBars())) {
          if (insets?.isVisible(type) == true) previousVisibleTypes = previousVisibleTypes or type
        }
      } else {
        legacyRoot = rootView
        previousFlags = rootView.systemUiVisibility
      }
      hideBars()
    }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) hideBars()
  }

  private fun hideBars() {
    if (Build.VERSION.SDK_INT >= 30) {
      controller?.apply {
        systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        hide(WindowInsets.Type.systemBars())
      }
    } else {
      legacyRoot?.systemUiVisibility = previousFlags or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
        View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
  }

  override fun onDetachedFromWindow() {
    attachmentGeneration++
    if (Build.VERSION.SDK_INT >= 30) {
      controller?.apply {
        systemBarsBehavior = previousBehavior
        if (previousVisibleTypes != 0) show(previousVisibleTypes)
      }
      controller = null
    } else {
      legacyRoot?.systemUiVisibility = previousFlags
      legacyRoot = null
    }
    super.onDetachedFromWindow()
  }
}
