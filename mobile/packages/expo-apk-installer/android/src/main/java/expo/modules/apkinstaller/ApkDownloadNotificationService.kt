package expo.modules.apkinstaller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

private const val CHANNEL_ID = "orca_apk_download"
private const val DOWNLOAD_NOTIFICATION_ID = 6083
private const val READY_NOTIFICATION_ID = 6084

class ApkDownloadNotificationService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (phase != Phase.DOWNLOADING) {
      stopSelf(startId)
      return START_NOT_STICKY
    }
    createChannel(this)
    ServiceCompat.startForeground(
      this,
      DOWNLOAD_NOTIFICATION_ID,
      downloadNotification(this),
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    )
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    phase = Phase.IDLE
    notificationManager(this).cancel(DOWNLOAD_NOTIFICATION_ID)
    stopSelf(startId)
  }

  companion object {
    private enum class Phase { IDLE, DOWNLOADING, READY }

    private var phase = Phase.IDLE
    private var title = "APK download"
    private var progressPercent: Int? = null

    fun begin(context: Context, downloadTitle: String) {
      if (phase == Phase.DOWNLOADING) {
        throw IllegalStateException("An APK download notification is already active")
      }
      title = downloadTitle.trim().ifEmpty { "APK download" }
      progressPercent = null
      phase = Phase.DOWNLOADING
      createChannel(context)
      notificationManager(context).cancel(READY_NOTIFICATION_ID)
      try {
        ContextCompat.startForegroundService(
          context,
          Intent(context, ApkDownloadNotificationService::class.java)
        )
      } catch (error: Exception) {
        phase = Phase.IDLE
        throw error
      }
    }

    fun update(context: Context, percent: Int) {
      requireDownloading()
      progressPercent = percent.coerceIn(0, 100)
      notificationManager(context).notify(DOWNLOAD_NOTIFICATION_ID, downloadNotification(context))
    }

    fun markReady(context: Context) {
      requireDownloading()
      phase = Phase.READY
      context.stopService(Intent(context, ApkDownloadNotificationService::class.java))
      notificationManager(context).cancel(DOWNLOAD_NOTIFICATION_ID)
      notificationManager(context).notify(READY_NOTIFICATION_ID, readyNotification(context))
    }

    fun stop(context: Context) {
      phase = Phase.IDLE
      context.stopService(Intent(context, ApkDownloadNotificationService::class.java))
      notificationManager(context).cancel(DOWNLOAD_NOTIFICATION_ID)
      notificationManager(context).cancel(READY_NOTIFICATION_ID)
    }

    private fun requireDownloading() {
      check(phase == Phase.DOWNLOADING) { "No APK download notification is active" }
    }

    private fun downloadNotification(context: Context): Notification =
      notificationBuilder(context)
        .setContentTitle(title)
        .setContentText(progressPercent?.let { "Downloading APK: $it%" } ?: "Downloading APK")
        .setOngoing(true)
        .setProgress(100, progressPercent ?: 0, progressPercent == null)
        .build()

    private fun readyNotification(context: Context): Notification =
      notificationBuilder(context)
        .setContentTitle(title)
        .setContentText("APK ready to install")
        .setAutoCancel(true)
        .build()

    private fun notificationBuilder(context: Context): NotificationCompat.Builder {
      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOnlyAlertOnce(true)
      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        builder.setContentIntent(
          PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
        )
      }
      return builder
    }

    private fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      notificationManager(context).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "APK downloads", NotificationManager.IMPORTANCE_LOW)
      )
    }

    private fun notificationManager(context: Context): NotificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  }
}
