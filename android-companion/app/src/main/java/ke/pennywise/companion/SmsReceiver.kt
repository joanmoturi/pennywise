package ke.pennywise.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.provider.Telephony
import java.util.concurrent.RejectedExecutionException

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val app = context.applicationContext as CompanionApp
        if (!app.permissionGranted()) { app.pauseForPermissionLoss(); return }
        if (!app.deviceReady() || !app.loadSafely() || app.config.paused) return
        val receivedAt = System.currentTimeMillis()
        val started = SystemClock.elapsedRealtime()
        val snapshot = app.config
        val pending = goAsync()
        try {
            app.smsWorker.execute {
                try {
                    if (SystemClock.elapsedRealtime() - started > 8_000) {
                        app.safeCount("overload"); return@execute
                    }
                    if (app.config.revision != snapshot.revision || !app.permissionGranted() ||
                        !app.deviceReady()) return@execute
                    val format = intent.getStringExtra("format")
                    if (format !in setOf("3gpp", "3gpp2")) {
                        app.safeCount("unsupportedEncoding"); return@execute
                    }
                    @Suppress("DEPRECATION")
                    val pdus = intent.extras?.get("pdus") as? Array<*>
                    if (pdus == null || pdus.size !in 1..32 ||
                        pdus.any { it !is ByteArray || it.size !in 1..4096 }) {
                        app.safeCount("malformed"); return@execute
                    }
                    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                    if (messages == null || messages.size != pdus.size || messages.any { it == null }) {
                        app.safeCount("malformed"); return@execute
                    }
                    // Framework PDU decoding is necessary to obtain addresses; bodies are not accessed until every sender passes.
                    val source = CaptureGate.source(snapshot, messages.first().originatingAddress,
                        receivedAt, app.permissionGranted()) ?: return@execute
                    if (messages.any { SmsSenders.normalize(it.originatingAddress) != source.senderId }) return@execute
                    val message = SmsAssembly.assemble(messages.map {
                        SmsPart(it.originatingAddress, it.timestampMillis, it.messageBody)
                    }, format, receivedAt)
                    val parsed = if (SensitiveFilter.excludes(message.body)) null else
                        Parsers.forSource(source).parse(source, message.body, receivedAt, snapshot.retainRaw)
                    synchronized(app.stateLock) {
                        if (app.config.revision != snapshot.revision || !app.permissionGranted() ||
                            !app.deviceReady() || CaptureGate.source(app.config, message.sender, receivedAt, true) == null) {
                            return@synchronized
                        }
                        if (parsed != null) app.store.record(parsed.copy(senderId = message.sender))
                        else app.safeCount(if (SensitiveFilter.excludes(message.body)) "excluded" else "unrecognized")
                        app.store.processed(receivedAt, parsed != null)
                        app.observeSender(source.sourceId, message.sender)
                        app.store.pruneRaw(receivedAt, app.config)
                    }
                } catch (failure: SmsInputException) {
                    app.safeCount(when (failure.reason) {
                        SmsFailure.MALFORMED -> "malformed"
                        SmsFailure.INVALID_TIMESTAMP -> "invalidTimestamp"
                        SmsFailure.UNSUPPORTED_ENCODING -> "unsupportedEncoding"
                    })
                } catch (_: Exception) {
                    app.safeCount("captureErrors")
                } finally { pending.finish() }
            }
        } catch (_: RejectedExecutionException) {
            app.safeCount("overload")
            pending.finish()
        }
    }
}
