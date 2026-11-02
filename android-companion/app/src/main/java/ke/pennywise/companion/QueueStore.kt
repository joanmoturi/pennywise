package ke.pennywise.companion

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.time.Instant

class QueueStore(context: Context, name: String = "private-queue.db",
                 private val crypto: CryptoBox = CryptoBox()) : SQLiteOpenHelper(context, name, null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE config (id INTEGER PRIMARY KEY CHECK(id=1), body BLOB NOT NULL)")
        db.execSQL("CREATE TABLE queue (id TEXT PRIMARY KEY, ref_hash TEXT, body BLOB NOT NULL)")
        db.execSQL("CREATE INDEX queue_reference ON queue(ref_hash)")
        db.execSQL("CREATE TABLE reference_receipts (hash TEXT PRIMARY KEY)")
        db.execSQL("CREATE TABLE seen (hash TEXT PRIMARY KEY, candidate_id TEXT NOT NULL)")
        db.execSQL("CREATE TABLE stats (name TEXT PRIMARY KEY, count INTEGER NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error("Unsupported schema")
    }

    @Synchronized
    fun readConfig(): Config = readableDatabase.rawQuery("SELECT body FROM config WHERE id=1", null).use {
        if (it.moveToFirst()) JsonCodec.readConfig(crypto.decrypt(it.getBlob(0), "config")) else Config()
    }

    @Synchronized
    fun saveConfig(config: Config) {
        check(writableDatabase.insertWithOnConflict("config", null, ContentValues().apply {
            put("id", 1); put("body", crypto.encrypt(JsonCodec.config(config), "config"))
        }, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
    }

    @Synchronized
    fun pending(): List<Candidate> = readableDatabase.rawQuery("SELECT id,body FROM queue ORDER BY rowid DESC", null).use {
        val rows = mutableListOf<Candidate>()
        while (it.moveToNext()) {
            rows.add(JsonCodec.readCandidate(org.json.JSONObject(
                crypto.decrypt(it.getBlob(1), "queue:${it.getString(0)}")), true))
        }
        rows
    }

    @Synchronized
    fun record(candidate: Candidate): DedupAction = transaction {
        val db = writableDatabase
        val seen = db.rawQuery("SELECT 1 FROM seen WHERE hash=?", arrayOf(candidate.fingerprint)).use { it.moveToFirst() }
        val refHash = Hashes.reference(candidate)
        val existingId = refHash?.let {
            db.rawQuery("SELECT hash FROM reference_receipts WHERE hash=?", arrayOf(it)).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }
        val action = DedupPolicy.action(seen, existingId != null)
        if (action == DedupAction.DUPLICATE) {
            count("duplicates")
        } else {
            require(db.rawQuery("SELECT count(*) FROM queue", null).use { it.moveToFirst(); it.getInt(0) } < 2000)
            // A changed reference is a separate review version; never silently overwrite an unreceived payload.
            val saved = if (existingId != null) candidate.copy(validation = "incomplete",
                confidence = minOf(candidate.confidence, 35),
                missing = (candidate.missing + "updatedReference").distinct()) else candidate
            val idCollision = db.rawQuery("SELECT body FROM queue WHERE id=?", arrayOf(saved.id)).use {
                if (it.moveToFirst()) JsonCodec.readCandidate(org.json.JSONObject(
                    crypto.decrypt(it.getBlob(0), "queue:${saved.id}")), true) else null
            }
            require(idCollision == null || idCollision.fingerprint == saved.fingerprint)
            db.insertWithOnConflict("queue", null, ContentValues().apply {
                put("id", saved.id); put("ref_hash", refHash)
                put("body", crypto.encrypt(JsonCodec.candidate(saved).toString(), "queue:${saved.id}"))
            }, SQLiteDatabase.CONFLICT_REPLACE).also { check(it != -1L) }
            db.insertOrThrow("seen", null, ContentValues().apply {
                put("hash", saved.fingerprint); put("candidate_id", saved.id)
            })
            if (refHash != null) db.insertWithOnConflict("reference_receipts", null,
                ContentValues().apply { put("hash", refHash) }, SQLiteDatabase.CONFLICT_IGNORE)
            count(if (action == DedupAction.UPDATE) "updates" else "captured")
        }
        action
    }

    @Synchronized
    fun restore(candidates: List<Candidate>) = transaction {
        candidates.forEach { record(it) }
    }

    @Synchronized
    fun acknowledge(candidates: List<Candidate>, confirmedByReceipt: Boolean = false) = transaction {
        candidates.forEach { candidate ->
            // A capture update after the screen loaded must not be deleted by an older receipt.
            val current = writableDatabase.rawQuery("SELECT body FROM queue WHERE id=?", arrayOf(candidate.id)).use {
                if (it.moveToFirst()) JsonCodec.readCandidate(org.json.JSONObject(
                    crypto.decrypt(it.getBlob(0), "queue:${candidate.id}")), true) else null
            }
            if (current?.fingerprint == candidate.fingerprint) {
                writableDatabase.delete("queue", "id=?", arrayOf(candidate.id))
                count("receipts")
                if (confirmedByReceipt) count("confirmedImports")
            }
        }
    }

    @Synchronized
    fun pruneRaw(now: Long, config: Config) = transaction {
        pending().forEach { candidate ->
            if (candidate.raw != null && (!config.retainRaw ||
                now - Instant.parse(candidate.capturedAt).toEpochMilli() > config.retentionDays * 86_400_000L)) {
                writableDatabase.update("queue", ContentValues().apply {
                    put("body", crypto.encrypt(JsonCodec.candidate(candidate.copy(raw = null)).toString(), "queue:${candidate.id}"))
                }, "id=?", arrayOf(candidate.id))
            }
        }
    }

    @Synchronized
    fun count(name: String) {
        require(name in setOf("duplicates", "updates", "captured", "receipts", "captureErrors", "overload",
            "processed", "excluded", "unrecognized", "malformed", "unsupportedEncoding", "invalidTimestamp",
            "confirmedImports"))
        writableDatabase.execSQL("INSERT OR IGNORE INTO stats(name,count) VALUES(?,0)", arrayOf(name))
        writableDatabase.execSQL("UPDATE stats SET count=count+1 WHERE name=?", arrayOf(name))
    }

    @Synchronized
    fun stats(): Map<String, Long> = readableDatabase.rawQuery("SELECT name,count FROM stats", null).use {
        buildMap { while (it.moveToNext()) put(it.getString(0), it.getLong(1)) }
    }

    @Synchronized
    fun processed(at: Long, candidateCreated: Boolean): Unit = transaction {
        count("processed")
        if (candidateCreated) {
            writableDatabase.insertWithOnConflict("stats", null, ContentValues().apply {
                put("name", "lastProcessed"); put("count", at)
            }, SQLiteDatabase.CONFLICT_REPLACE).also { check(it != -1L) }
        }
    }

    @Synchronized
    fun deleteAll() = transaction {
        writableDatabase.delete("queue", null, null)
        writableDatabase.delete("seen", null, null)
        writableDatabase.delete("reference_receipts", null, null)
        writableDatabase.delete("stats", null, null)
    }

    private fun <T> transaction(block: () -> T): T {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val result = block()
            db.setTransactionSuccessful()
            return result
        } finally { db.endTransaction() }
    }
}
