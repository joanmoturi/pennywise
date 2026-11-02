package ke.pennywise.companion

import android.app.Application
import android.app.KeyguardManager
import android.content.ComponentName
import android.os.UserManager
import android.provider.Settings

class CompanionApp : Application() {
    lateinit var store: QueueStore
        private set
    val stateLock = Any()
    @Volatile var config: Config = Config()
        private set
    @Volatile var connectedAt: Long = 0
        private set
    @Volatile var storageAvailable = false
        private set

    override fun onCreate() {
        super.onCreate()
        store = QueueStore(this)
        loadSafely()
    }

    fun permissionGranted(): Boolean {
        val own = ComponentName(this, CaptureService::class.java)
        return Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.split(':')?.any { ComponentName.unflattenFromString(it) == own } == true
    }

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
            val safe = saved.copy(paused = true, sources = saved.sources.map {
                it.copy(enabled = false, activatedAt = System.currentTimeMillis())
            }, revision = saved.revision + 1)
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

    fun boundary(connected: Boolean) = synchronized(stateLock) {
        // Fail closed immediately even if the Keystore is temporarily unavailable.
        connectedAt = if (connected) System.currentTimeMillis() else 0
        val next = config.copy(paused = true, revision = config.revision + 1,
            sources = config.sources.map { it.copy(enabled = false, activatedAt = System.currentTimeMillis()) })
        config = next
        try {
            if (storageAvailable) store.saveConfig(next)
        } catch (_: Exception) { storageAvailable = false }
    }

    fun observePreview(packageName: String) = synchronized(stateLock) {
        val next = config.copy(sources = config.sources.map {
            if (it.packageName == packageName) it.copy(previewAvailable = true) else it
        })
        store.saveConfig(next)
        config = next
    }

    fun safeCount(name: String) {
        try { store.count(name) } catch (_: Exception) { /* Metadata is best effort if storage is unavailable. */ }
    }
}
