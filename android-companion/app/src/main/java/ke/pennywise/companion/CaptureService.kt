package ke.pennywise.companion

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class CaptureService : NotificationListenerService() {
    private val app get() = application as CompanionApp
    private val worker = ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, ArrayBlockingQueue(32),
        ThreadPoolExecutor.AbortPolicy())

    override fun onListenerConnected() {
        super.onListenerConnected()
        app.loadSafely()
        app.boundary(true)
        // Never request activeNotifications: only future callbacks can be considered.
    }

    override fun onListenerDisconnected() {
        app.boundary(false)
        worker.queue.clear()
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        app.boundary(false)
        worker.shutdownNow()
        super.onDestroy()
    }

    private fun allowed(sbn: StatusBarNotification, config: Config): Boolean =
        app.storageAvailable && app.deviceReady() && CaptureGate.permits(config, sbn.packageName, sbn.postTime,
            System.currentTimeMillis(), app.connectedAt, app.permissionGranted(),
            sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val snapshot = app.config
        if (!allowed(sbn, snapshot)) return
        try {
            worker.execute {
                try {
                    if (app.config.revision != snapshot.revision || !allowed(sbn, snapshot)) return@execute
                    // This is the first extras access, strictly after package/session/permission gating.
                    val extras = sbn.notification.extras
                    val body = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                        ?: extras.getCharSequence(Notification.EXTRA_TEXT) ?: return@execute
                    val title = extras.getCharSequence(Notification.EXTRA_TITLE)
                    if (body.length > 8192 || (title?.length ?: 0) > 1024) return@execute
                    val text = body.toString()
                    if (SensitiveFilter.excludes("${title ?: ""}\n$text")) return@execute
                    val source = snapshot.sources.first { it.packageName == sbn.packageName }
                    val now = System.currentTimeMillis()
                    val candidate = Parsers.forSource(source).parse(source, text, now, snapshot.retainRaw)
                        ?: return@execute
                    synchronized(app.stateLock) {
                        if (app.config.revision != snapshot.revision || !allowed(sbn, app.config)) return@synchronized
                        app.store.record(candidate)
                        app.store.pruneRaw(now, app.config)
                        if (!source.previewAvailable) app.observePreview(source.packageName)
                    }
                } catch (_: Exception) { app.safeCount("captureErrors") }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            app.safeCount("overload")
        }
    }
}
