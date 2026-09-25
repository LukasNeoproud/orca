package expo.modules.apkinstaller

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val UNKNOWN_SOURCES_REQUEST = 6081
private const val INSTALL_REQUEST = 6082

class ExpoApkInstallerModule : Module() {
  private var pending: PendingInstall? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoApkInstaller")

    AsyncFunction("install") { localApkPath: String, promise: Promise ->
      if (pending != null) {
        promise.reject("INSTALL_IN_PROGRESS", "An APK installation is already active", null)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null || !activity.isResumedForApkInstall()) {
        promise.reject("APK_APP_BACKGROUND", "Return to Orca to install the APK", null)
        return@AsyncFunction
      }

      val apk = try {
        resolveApk(activity, localApkPath)
      } catch (error: Exception) {
        promise.reject("INVALID_APK", error.message ?: "Invalid APK path", error)
        return@AsyncFunction
      }

      val request = PendingInstall(apk, promise)
      pending = request
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !activity.packageManager.canRequestPackageInstalls()) {
        try {
          val settings = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}")
          )
          activity.startActivityForResult(settings, UNKNOWN_SOURCES_REQUEST)
        } catch (error: Exception) {
          reject(request, "PERMISSION_SETTINGS_UNAVAILABLE", "Cannot open install permission settings", error)
        }
      } else {
        launchInstaller(activity, request)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startDownloadNotification") { title: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || !activity.isResumedForApkInstall()) {
        promise.reject("APK_APP_BACKGROUND", "Return to Orca to start the APK download", null)
        return@AsyncFunction
      }
      try {
        ApkDownloadNotificationService.begin(activity.applicationContext, title)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("DOWNLOAD_NOTIFICATION_FAILED", error.message ?: "Cannot start APK download notification", error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("updateDownloadNotification") { progressPercent: Int, promise: Promise ->
      try {
        ApkDownloadNotificationService.update(downloadContext(), progressPercent)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("DOWNLOAD_NOTIFICATION_FAILED", error.message ?: "Cannot update APK download notification", error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("markDownloadReady") { promise: Promise ->
      try {
        ApkDownloadNotificationService.markReady(downloadContext())
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("DOWNLOAD_NOTIFICATION_FAILED", error.message ?: "Cannot complete APK download notification", error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopDownloadNotification") { promise: Promise ->
      try {
        ApkDownloadNotificationService.stop(downloadContext())
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("DOWNLOAD_NOTIFICATION_FAILED", error.message ?: "Cannot stop APK download notification", error)
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { activity, (requestCode, resultCode, _) ->
      val request = pending ?: return@OnActivityResult
      when (requestCode) {
        UNKNOWN_SOURCES_REQUEST -> {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()) {
            reject(request, "INSTALL_PERMISSION_DENIED", "Permission to install apps from Orca was not granted")
          } else {
            launchInstaller(activity, request)
          }
        }
        INSTALL_REQUEST -> when (resultCode) {
          Activity.RESULT_OK -> {
            pending = null
            request.promise.resolve(null)
          }
          Activity.RESULT_CANCELED -> reject(request, "INSTALL_CANCELLED", "APK installation was cancelled")
          else -> reject(request, "INSTALL_FAILED", "Android could not install the APK")
        }
      }
    }

    OnActivityDestroys { cancelPending() }
    OnDestroy { cancelPending() }
  }

  private fun launchInstaller(activity: Activity, request: PendingInstall) {
    if (!activity.isResumedForApkInstall()) {
      reject(request, "APK_APP_BACKGROUND", "Return to Orca to install the APK")
      return
    }
    try {
      if (!request.apk.isFile || !request.apk.canRead() || request.apk.length() == 0L) {
        throw IllegalArgumentException("APK is missing, empty, or unreadable")
      }
      val uri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.apk-installer",
        request.apk
      )
      val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
        data = uri
        clipData = ClipData.newRawUri("APK", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
      }
      activity.startActivityForResult(intent, INSTALL_REQUEST)
    } catch (error: Exception) {
      reject(request, "INSTALLER_UNAVAILABLE", error.message ?: "Cannot open Android package installer", error)
    }
  }

  private fun reject(request: PendingInstall, code: String, message: String, error: Exception? = null) {
    if (pending !== request) return
    pending = null
    request.promise.reject(code, message, error)
  }

  private fun cancelPending() {
    pending?.let { reject(it, "INSTALL_CANCELLED", "Activity was destroyed") }
  }

  private fun downloadContext(): Context =
    appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
      ?: throw IllegalStateException("Android application context is unavailable")

  private class PendingInstall(val apk: File, val promise: Promise)
}

private fun Activity.isResumedForApkInstall(): Boolean =
  this is LifecycleOwner && lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)

private fun resolveApk(context: Context, localApkPath: String): File {
  val uri = Uri.parse(localApkPath)
  val path = when (uri.scheme) {
    null -> localApkPath
    "file" -> uri.path ?: throw IllegalArgumentException("APK URI has no path")
    else -> throw IllegalArgumentException("APK must be a local file")
  }
  require(path.startsWith(File.separator)) { "APK path must be absolute" }
  val apk = File(path).canonicalFile
  require(apk.name.endsWith(".apk", ignoreCase = true)) { "File must have an .apk extension" }
  val roots = listOfNotNull(
    context.cacheDir,
    context.filesDir,
    context.externalCacheDir,
    context.getExternalFilesDir(null)
  ).map { it.canonicalFile }
  require(roots.any { apk.path.startsWith(it.path + File.separator) }) {
    "APK must be in Orca's cache or files directory"
  }
  require(apk.isFile && apk.canRead() && apk.length() > 0) {
    "APK is missing, empty, or unreadable"
  }
  return apk
}
