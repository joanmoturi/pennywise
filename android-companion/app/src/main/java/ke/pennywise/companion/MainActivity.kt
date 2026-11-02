package ke.pennywise.companion

import android.app.Activity
import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.ArrayAdapter
import android.widget.TextView
import android.widget.Toast
import java.math.BigDecimal
import java.time.Instant

class MainActivity : Activity() {
    private val app get() = application as CompanionApp
    private lateinit var page: LinearLayout
    private val selected = linkedMapOf<String, String>()
    private var pageNumber = 0
    private var savePayload: String? = null
    private val navy = Color.rgb(9, 20, 38)
    private val gold = Color.rgb(216, 180, 90)
    private val pale = Color.rgb(225, 232, 241)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.decorView.setOnApplyWindowInsetsListener { view, insets ->
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        render()
    }

    override fun onResume() {
        super.onResume()
        PrivateFileProvider.cleanup(this)
        app.loadSafely()
        if (!app.permissionGranted() && (app.connectedAt > 0 || !app.config.paused ||
            app.config.sources.any { it.enabled })) app.boundary(false)
        render()
    }

    private fun column() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(12), dp(18), dp(12))
        setBackgroundColor(navy)
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun label(parent: LinearLayout, value: String, heading: Boolean = false): TextView =
        TextView(this).apply {
            text = value; textSize = if (heading) 23f else 15f
            setTextColor(if (heading) gold else pale)
            setPadding(0, dp(8), 0, dp(8))
            parent.addView(this)
        }
    private fun button(parent: LinearLayout, value: String, action: () -> Unit): Button =
        Button(this).apply {
            text = value; isAllCaps = false; setTextColor(gold)
            parent.addView(this); setOnClickListener { guarded(action) }
        }
    private fun input(parent: LinearLayout, caption: String, value: String = ""): EditText {
        label(parent, caption)
        return EditText(this).apply {
            setText(value); setTextColor(pale); setHintTextColor(Color.LTGRAY)
            setSingleLine(true); filters = arrayOf(android.text.InputFilter.LengthFilter(256))
            parent.addView(this)
        }
    }
    private fun check(parent: LinearLayout, caption: String, checked: Boolean): CheckBox =
        CheckBox(this).apply {
            text = caption; isChecked = checked; setTextColor(pale); parent.addView(this)
        }
    private fun scroll(child: View) = ScrollView(this).apply { addView(child) }
    private fun notifyUser(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun guarded(action: () -> Unit) {
        try { PrivateFileProvider.cleanup(this); action() } catch (_: Exception) {
            notifyUser("Operation stopped safely. Unlock your device, check available storage, then retry. No pending entry was confirmed.")
        }
    }

    private fun render() {
        page = column()
        setContentView(scroll(page))
        label(page, "PENNYWISE", true)
        label(page, "Private Android companion · no Internet / SMS / analytics")
        if (!app.storageAvailable) {
            label(page, "Encrypted storage unavailable. Capture stays paused. Unlock your device and retry. If the device key was lost, use a previously saved recovery JSON; do not uninstall to troubleshoot without a recovery file.")
            button(page, "Retry unlocked storage") { app.loadSafely(); render() }
            return
        }
        guarded {
            app.store.pruneRaw(System.currentTimeMillis(), app.config)
            val candidates = app.store.pending()
            selected.entries.removeAll { selection ->
                candidates.none { it.id == selection.key && it.fingerprint == selection.value }
            }
            val stats = app.store.stats()
            label(page, if (app.config.paused) "Capture PAUSED" else "Capture enabled", true)
            label(page, "Pending ${candidates.size}  ·  Duplicates ${stats["duplicates"] ?: 0}\n" +
                "Reference updates ${stats["updates"] ?: 0}  ·  Verified receipts ${stats["receipts"] ?: 0}\n" +
                "Capture/storage errors ${stats["captureErrors"] ?: 0}  ·  Busy/dropped ${stats["overload"] ?: 0}")
            val permission = app.permissionGranted()
            label(page, "Notification access: ${if (permission) "granted" else "MISSING"} · " +
                "Listener: ${if (app.connectedAt > 0) "connected" else "disconnected"}")
            label(page, "Android grants broad listener access, not per-app access. This companion ignores packages before reading extras. Granting access does NOT activate sources. Disconnect/restart disables sources and pauses capture.")
            val locked = !getSystemService(KeyguardManager::class.java).isDeviceSecure
            if (locked) label(page, "Set a device PIN/password first. Capture cannot resume without a secure device lock.")
            button(page, "Notification access settings") {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            button(page, if (app.config.paused) "Resume future capture" else "Pause now") {
                if (app.config.paused) {
                    if (!app.permissionGranted() || app.connectedAt <= 0 || locked) {
                        notifyUser("Grant notification access, wait for connection, and set a device lock first.")
                    } else if (app.config.sources.none { it.enabled }) {
                        notifyUser("Explicitly enable at least one source first.")
                    } else app.update { config ->
                        config.copy(paused = false, sources = config.sources.map {
                            if (it.enabled) it.copy(activatedAt = System.currentTimeMillis()) else it
                        })
                    }
                } else app.update { it.copy(paused = true) }
                render()
            }
            button(page, "Refresh dashboard") { render() }
            sourceSection()
            button(page, "Privacy / raw retention") { retentionSettings() }
            label(page, "Pending review", true)
            label(page, "Synthetic labelled parsers only until you configure labels against your own examples. No bank-format accuracy claim. Incomplete/low-confidence entries need review; nothing posts to a ledger here.")
            val overdue = candidates.count {
                System.currentTimeMillis() - Instant.parse(it.capturedAt).toEpochMilli() >
                    app.config.retentionDays * 86_400_000L
            }
            label(page, "${selected.size}/100 selected (500,000-byte maximum; select fewer if raw is large). Raw retention ${if (app.config.retainRaw) "ON" else "OFF"} · ${app.config.retentionDays} days.\n" +
                "$overdue pending entries older than that period. Queue entries NEVER auto-delete: verify receipt or explicitly delete.")
            pageNumber = pageNumber.coerceIn(0, maxOf(0, (candidates.size - 1) / 50))
            val visible = candidates.drop(pageNumber * 50).take(50)
            button(page, "Select this page (up to 100)") {
                visible.forEach { if (selected.size < 100) selected[it.id] = it.fingerprint }
                render()
            }
            button(page, "Clear selection") { selected.clear(); render() }
            visible.forEach { candidate ->
                val amount = candidate.amount?.let { BigDecimal.valueOf(it, 2).toPlainString() } ?: "amount missing"
                check(page, "${candidate.source}\n${candidate.kind} · ${candidate.currency ?: "?"} $amount\n" +
                    "${candidate.reference ?: "no reference"} · ${candidate.validation} · ${candidate.confidence}%",
                    selected.containsKey(candidate.id)).setOnCheckedChangeListener { box, checked ->
                    if (checked && selected.size >= 100 && !selected.containsKey(candidate.id)) {
                        box.isChecked = false
                        notifyUser("Maximum 100 candidates per batch.")
                    } else if (checked) selected[candidate.id] = candidate.fingerprint
                    else selected.remove(candidate.id)
                }
                button(page, "Review ${candidate.id.take(8)}") {
                    AlertDialog.Builder(this).setTitle("Candidate details · not a bank statement")
                        .setMessage(JsonCodec.candidate(candidate).toString(2))
                        .setPositiveButton("Close", null).show()
                }
            }
            if (pageNumber > 0) button(page, "Previous page") { pageNumber--; render() }
            if ((pageNumber + 1) * 50 < candidates.size) button(page, "Next page") { pageNumber++; render() }
            button(page, "Share selected JSON → Pennywise") {
                val chosen = chosen()
                confirm("Share private financial data?", "Choose Pennywise or another trusted local target. " +
                    "The recipient receives plaintext JSON. Sharesheet completion is NOT proof of receipt. " +
                    "Remain OFFLINE for the entire handoff: a stale Chrome share target may otherwise send the file to hosting " +
                    "without its service worker. If Pennywise is absent, save privately and choose the file in its Transaction Inbox.") {
                    val chooser = Intent.createChooser(PrivateFileProvider.shareIntent(this, JsonCodec.batch(chosen)),
                        "Send pending candidates OFFLINE")
                    if (!ShareGate.permits(getSystemService(ConnectivityManager::class.java).activeNetwork != null)) {
                        PrivateFileProvider.cleanup(this, true)
                        AlertDialog.Builder(this).setTitle("Offline sharing required")
                            .setMessage("Turn airplane mode on and disable Wi-Fi for safe offline sharing, or save private JSON " +
                                "then choose it in Pennywise Transaction Inbox file picker. Keep networking off throughout " +
                                "Sharesheet handoff: Chrome could otherwise POST a stale share target to hosting.")
                            .setPositiveButton("OK", null).show()
                    } else startActivity(chooser)
                }
            }
            button(page, "Save selected JSON / recovery file") {
                val chosen = chosen()
                confirm("Plaintext financial recovery file", "Save only to a private, trusted location. " +
                    "Some document providers upload files to cloud storage independently of this app. " +
                    "This file preserves pending candidate IDs, not settings, Keystore keys, receipts or the PWA ledger.") {
                    PrivateFileProvider.cleanup(this, true)
                    savePayload = JsonCodec.batch(chosen)
                    startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        type = "application/json"; addCategory(Intent.CATEGORY_OPENABLE)
                        putExtra(Intent.EXTRA_TITLE, "pennywise-pending.json")
                    }, SAVE_FILE)
                }
            }
            button(page, "I verified receipt in Pennywise") {
                val chosen = chosen()
                confirm("Confirm ${chosen.size} verified receipts?", "Only continue after checking these exact candidates " +
                    "in Pennywise Transaction Inbox. This removes their local pending payloads, not the PWA ledger. " +
                    "Unselected update versions stay pending; fingerprint receipts remain for local duplicate suppression.") {
                    synchronized(app.stateLock) { app.store.acknowledge(chosen) }
                    selected.clear(); PrivateFileProvider.cleanup(this, true); render()
                }
            }
            button(page, "Restore pending JSON file") {
                confirm("Restore pending candidates?", "Choose a previously saved companion handoff JSON (up to 100 entries / 500,000 bytes). " +
                    "It is not authenticated bank evidence. Stable IDs are preserved; conflicts stop the restore. " +
                    "Capture pauses, all sources disable, and raw is discarded unless retention is on. " +
                    "PWA backups belong in Pennywise, not here.") {
                    app.update { config -> config.copy(paused = true, sources = config.sources.map {
                        it.copy(enabled = false, activatedAt = System.currentTimeMillis())
                    }) }
                    startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        type = "application/json"; addCategory(Intent.CATEGORY_OPENABLE)
                    }, RESTORE_FILE)
                }
            }
            button(page, "Delete ALL local pending data") {
                confirm("Permanently delete all pending data?", "This destroys unsent candidates AND local fingerprint receipts. " +
                    "Retries can appear again after this. It does not delete the Pennywise ledger or files you saved elsewhere. " +
                    "Export a private recovery file first if needed. Capture will pause and sources disable.") {
                    app.update { config -> config.copy(paused = true,
                        sources = config.sources.map { it.copy(enabled = false, activatedAt = System.currentTimeMillis()) }) }
                    synchronized(app.stateLock) { app.store.deleteAll() }
                    selected.clear(); PrivateFileProvider.cleanup(this, true); render()
                }
            }
        }
    }

    private fun chosen(): List<Candidate> {
        val chosen = app.store.pending().filter { selected[it.id] == it.fingerprint }
        require(chosen.size in 1..100)
        return chosen
    }

    private fun confirm(title: String, message: String, action: () -> Unit) {
        AlertDialog.Builder(this).setTitle(title).setMessage(message)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Confirm") { _, _ -> guarded(action) }.show()
    }

    private fun sourceSection() {
        label(page, "Sources", true)
        app.config.sources.forEach { source ->
            button(page, "${if (source.enabled) "ON" else "OFF"} · ${source.displayName}\n${source.packageName}\n" +
                "${source.profile} · preview ${if (source.previewAvailable) "observed" else "not observed"}") {
                editSource(source)
            }
        }
        button(page, "Choose launcher-visible app") {
            val apps = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
                .distinctBy { it.activityInfo.packageName }
                .sortedBy { it.loadLabel(packageManager).toString().lowercase() }
            AlertDialog.Builder(this).setTitle("Select a source (disabled initially)")
                .setItems(apps.map { "${it.loadLabel(packageManager)}\n${it.activityInfo.packageName}" }.toTypedArray()) { _, index ->
                    val info = apps[index]
                    editSource(app.config.sources.firstOrNull { it.packageName == info.activityInfo.packageName }
                        ?: Source(info.activityInfo.packageName, info.loadLabel(packageManager).toString().take(80)))
                }.setNegativeButton("Cancel", null).show()
        }
        button(page, "Add exact package manually (non-launcher)") {
            val form = column()
            val packageName = input(form, "Exact package, e.g. synthetic.example")
            val displayName = input(form, "Display name")
            AlertDialog.Builder(this).setTitle("Manual source").setView(scroll(form))
                .setNegativeButton("Cancel", null).setPositiveButton("Configure") { _, _ -> guarded {
                    val name = packageName.text.toString().trim()
                    require(JsonCodec.validPackage(name))
                    editSource(app.config.sources.firstOrNull { it.packageName == name }
                        ?: Source(name, displayName.text.toString().trim().take(80).ifEmpty { name }))
                } }.show()
        }
    }

    private fun editSource(source: Source) {
        val form = column()
        label(form, source.packageName)
        val name = input(form, "Display name", source.displayName)
        val enabled = check(form, "Explicitly enable this source / parser for FUTURE posts", source.enabled)
        val profiles = arrayOf("mpesa", "equity", "kcb", "generic")
        label(form, "Source profile (ALL initially synthetic labelled examples)")
        val profile = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, profiles)
            setSelection(profiles.indexOf(source.profile).coerceAtLeast(0))
            form.addView(this)
        }
        label(form, "This does not implement a real bank's format. Use a literal prefix plus delimiter and label=value fields; " +
            "no executable regex. Configure only against examples you trust. Currency must explicitly be KES, direction/kind explicit, " +
            "amount plain decimal without commas; date ISO-8601 with zone. Missing data stays incomplete.")
        val prefix = input(form, "Literal prefix (4–48 safe characters)", source.prefix)
        val delimiter = input(form, "Delimiter: | or ; or ~", source.delimiter)
        val labels = Source.DEFAULT_LABELS.keys.associateWith {
            input(form, "$it label", source.labels.getValue(it))
        }
        val sample = input(form, "Optional local sample (not saved)", "")
        sample.filters = arrayOf(android.text.InputFilter.LengthFilter(8192))
        fun edited(): Source = source.copy(displayName = name.text.toString().trim().take(80).ifEmpty { source.packageName },
            profile = profiles[profile.selectedItemPosition], enabled = enabled.isChecked,
            activatedAt = System.currentTimeMillis(), prefix = prefix.text.toString(),
            delimiter = delimiter.text.toString(), labels = labels.mapValues { it.value.text.toString() })
        button(form, "Test sample locally (no queue write)") {
            val edit = edited(); require(LabelledParser.validProfile(edit))
            val result = Parsers.forSource(edit).parse(edit, sample.text.toString(), System.currentTimeMillis(), false)
            AlertDialog.Builder(this).setTitle("Local parser test · not accuracy certification")
                .setMessage(result?.let { JsonCodec.candidate(it).toString(2) }
                    ?: "Excluded: no safe labelled financial candidate. Sensitive/unrelated/balance-only text is not retained.")
                .setPositiveButton("Close", null).show()
        }
        val dialog = AlertDialog.Builder(this).setTitle("Configure source").setView(scroll(form))
            .setNegativeButton("Cancel", null).setNeutralButton("Remove source") { _, _ -> guarded {
                app.update { it.copy(sources = it.sources.filterNot { old -> old.packageName == source.packageName }) }
                render()
            } }.setPositiveButton("Save", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { guarded {
                val edit = edited()
                require(LabelledParser.validProfile(edit))
                if (edit.enabled && (!app.permissionGranted() || app.connectedAt <= 0)) {
                    notifyUser("Grant access and wait for listener connection first; save disabled meanwhile.")
                    return@guarded
                }
                require(app.config.sources.size < 200 || app.config.sources.any { it.packageName == edit.packageName })
                app.update { config ->
                    config.copy(sources = config.sources.filterNot { it.packageName == edit.packageName } + edit)
                }
                dialog.dismiss(); render()
            } }
        }
        dialog.show()
    }

    private fun retentionSettings() {
        val form = column()
        label(form, "Raw text is OFF by default. Optional raw is encrypted locally but becomes plaintext in exports. " +
            "OTP/PIN/password/login content is excluded even when raw is on. Only matched financial candidates can retain raw.")
        val raw = check(form, "Retain matched raw notification body", app.config.retainRaw)
        val days = input(form, "Raw retention / pending-age warning days (1–90)", app.config.retentionDays.toString())
        AlertDialog.Builder(this).setTitle("Privacy controls").setView(scroll(form))
            .setNegativeButton("Cancel", null).setPositiveButton("Save") { _, _ -> guarded {
                val retention = days.text.toString().toInt()
                require(retention in 1..90)
                app.update { it.copy(retainRaw = raw.isChecked, retentionDays = retention) }
                app.store.pruneRaw(System.currentTimeMillis(), app.config)
                PrivateFileProvider.cleanup(this, true)
                render()
            } }.show()
    }

    @Deprecated("Platform activity result API keeps runtime dependencies small")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data?.data == null) { savePayload = null; return }
        guarded {
            when (requestCode) {
                SAVE_FILE -> {
                    val payload = savePayload ?: error("Export expired; select and save again")
                    savePayload = null
                    requireNotNull(contentResolver.openOutputStream(data.data!!, "wt")).use {
                        it.write(payload.toByteArray(Charsets.UTF_8))
                    }
                    notifyUser("Saved plaintext recovery JSON. Pending entries retained; verify receipt separately.")
                }
                RESTORE_FILE -> {
                    val value = requireNotNull(contentResolver.openInputStream(data.data!!)).use {
                        BoundedIo.readUtf8(it, JsonCodec.MAX_FILE_BYTES)
                    }
                    val restored = JsonCodec.readBatch(value, app.config.retainRaw)
                    synchronized(app.stateLock) {
                        app.store.restore(restored)
                        app.store.pruneRaw(System.currentTimeMillis(), app.config)
                    }
                    notifyUser("Recovery merged; IDs retained. Explicitly enable sources and resume future capture when ready.")
                    selected.clear()
                }
            }
            render()
        }
    }

    companion object {
        private const val SAVE_FILE = 40
        private const val RESTORE_FILE = 41
    }
}
