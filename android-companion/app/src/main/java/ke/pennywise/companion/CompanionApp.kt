package ke.pennywise.companion

import android.app.Application
import android.app.KeyguardManager
import android.Manifest
import android.content.pm.PackageManager
import android.os.UserManager
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class CompanionApp : Application() {
    lateinit var store: QueueStore
        private set
    val stateLock = Any()
    @Volatile var config: Config = Config()
        private set
    @Volatile var storageAvailable = false
        private set
    val smsWorker = ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, ArrayBlockingQueue(8),
        ThreadPoolExecutor.AbortPolicy())

    override fun onCreate() {
        super.onCreate()
        store = QueueStore(this)
        loadSafely()
    }

    fun permissionGranted(): Boolean = checkSelfPermission(Manifest.permission.RECEIVE_SMS) ==
        PackageManager.PERMISSION_GRANTED

    fun deviceReady(): Boolean = CaptureGate.deviceReady(
        getSystemService(UserManager::class.java).isUserUnlocked,
        getSystemService(KeyguardManager::class.java).isDeviceSecure,
        isDeviceProtectedStorage)

    fun loadSafely(): Boolean = synchronized(stateLock) {
        if (!getSystemService(UserManager::class.java).isUserUnlocked || isDeviceProtectedStorage) {
            config = Config()
            storageAvailable = false
            return false
        }
        if (storageAvailable) return true
        try {
            val saved = store.readConfig()
            // Version-1 configuration migrates paused in the codec; ordinary SMS process restarts preserve consent.
            val safe = saved.copy(paused = saved.paused || !permissionGranted(), revision = saved.revision + 1)
            store.saveConfig(safe)
            config = safe
            storageAvailable = true
            true
        } catch (_: Exception) {
            config = Config()
            storageAvailable = false
            false
        }
    }

    fun update(transform: (Config) -> Config) = synchronized(stateLock) {
        check(storageAvailable)
        val next = transform(config).copy(revision = config.revision + 1)
        try {
            store.saveConfig(next)
            config = next
        } catch (failure: Exception) {
            config = next.copy(paused = true, sources = next.sources.map { it.copy(enabled = false) })
            storageAvailable = false
            throw failure
        }
    }

    fun pauseForPermissionLoss() = synchronized(stateLock) {
        val next = config.copy(paused = true, revision = config.revision + 1)
        config = next
        try {
            if (storageAvailable) store.saveConfig(next)
        } catch (_: Exception) { storageAvailable = false }
    }

    fun observeSender(sourceId: String, sender: String) = synchronized(stateLock) {
        val next = config.copy(sources = config.sources.map {
            if (it.sourceId == sourceId) it.copy(detectedSender = sender) else it
        })
        store.saveConfig(next)
        config = next
    }

    fun safeCount(name: String) {
        try { store.count(name) } catch (_: Exception) { /* Metadata is best effort if storage is unavailable. */ }
    }
}
