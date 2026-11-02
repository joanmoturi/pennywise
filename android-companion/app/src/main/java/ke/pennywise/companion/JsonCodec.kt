package ke.pennywise.companion

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

object JsonCodec {
    const val MAX_FILE_BYTES = 500_000
    const val MAX_BATCH = 100
    private val packagePattern = Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")

    fun validPackage(value: String): Boolean = value.length <= 200 && packagePattern.matches(value)

    fun config(config: Config): String = JSONObject().apply {
        put("paused", config.paused)
        put("retainRaw", config.retainRaw)
        put("retentionDays", config.retentionDays)
        put("revision", config.revision)
        put("sources", JSONArray().apply {
            config.sources.forEach { source ->
                put(JSONObject().apply {
                    put("packageName", source.packageName); put("displayName", source.displayName)
                    put("profile", source.profile); put("enabled", source.enabled)
                    put("activatedAt", source.activatedAt); put("previewAvailable", source.previewAvailable)
                    put("prefix", source.prefix); put("delimiter", source.delimiter)
                    put("labels", JSONObject(source.labels))
                })
            }
        })
    }.toString()

    fun readConfig(value: String): Config {
        val json = JSONObject(value)
        val sources = json.getJSONArray("sources")
        require(sources.length() <= 200)
        return Config(json.getBoolean("paused"), json.getBoolean("retainRaw"),
            json.getInt("retentionDays").coerceIn(1, 90), (0 until sources.length()).map {
                val s = sources.getJSONObject(it)
                Source(s.getString("packageName"), s.getString("displayName"),
                    s.getString("profile"), s.getBoolean("enabled"), s.getLong("activatedAt"),
                    s.getBoolean("previewAvailable"), s.getString("prefix"), s.getString("delimiter"),
                    Source.DEFAULT_LABELS.keys.associateWith { key -> s.getJSONObject("labels").getString(key) })
                    .also { item -> require(validPackage(item.packageName) && LabelledParser.validProfile(item)) }
            }, json.getLong("revision"))
    }

    fun candidate(candidate: Candidate): JSONObject = JSONObject().apply {
        put("id", candidate.id); put("source", candidate.source)
        put("parserId", candidate.parserId); put("parserVersion", candidate.parserVersion)
        put("capturedAt", candidate.capturedAt); put("occurredAt", candidate.occurredAt)
        put("reference", candidate.reference); put("amount", candidate.amount)
        put("currency", candidate.currency); put("direction", candidate.direction)
        put("kind", candidate.kind); put("counterparty", candidate.counterparty)
        put("fee", candidate.fee); put("balance", candidate.balance)
        put("confidence", candidate.confidence); put("missing", JSONArray(candidate.missing))
        put("validation", candidate.validation); put("fingerprint", candidate.fingerprint)
        put("originalReference", candidate.originalReference); put("raw", candidate.raw)
    }

    private fun text(json: JSONObject, key: String, max: Int, required: Boolean = false): String? {
        if (!json.has(key)) { require(!required); return null }
        val value = json.get(key)
        require(value is String && value.length in 1..max)
        return value
    }

    private fun minor(json: JSONObject, key: String): Long? {
        if (!json.has(key)) return null
        val number = json.get(key)
        require(number is Number && number.toString().matches(Regex("[0-9]{1,16}")))
        return number.toString().toLong().also { require(it in 0..MAX_SAFE_MINOR) }
    }

    fun readCandidate(json: JSONObject, allowRaw: Boolean): Candidate {
        require(json.toString().length <= 16_384)
        require(!SensitiveFilter.excludes(text(json, "raw", 8192) ?: ""))
        val id = text(json, "id", 36, true)!!
        require(UUID.fromString(id).toString() == id)
        val source = text(json, "source", 200, true)!!
        require(validPackage(source))
        val parser = text(json, "parserId", 80, true)!!
        require(parser.matches(Regex("[a-zA-Z0-9._-]+")))
        val captured = text(json, "capturedAt", 40, true)!!.also { Instant.parse(it) }
        val occurred = text(json, "occurredAt", 40)?.also { Instant.parse(it) }
        val direction = text(json, "direction", 10, true)!!.also { require(it in DIRECTIONS) }
        val kind = text(json, "kind", 20, true)!!.also { require(it in KINDS && it != "balance") }
        val validation = text(json, "validation", 12, true)!!
            .also { require(it in setOf("valid", "incomplete", "excluded")) }
        val confidenceValue = json.get("confidence")
        require(confidenceValue is Number && confidenceValue.toString().matches(Regex("[0-9]{1,3}")))
        val confidence = confidenceValue.toString().toInt().also { require(it in 0..100) }
        val missing = json.getJSONArray("missing").also { require(it.length() <= 20) }
        val missingValues = (0 until missing.length()).map {
            require(missing.get(it) is String)
            missing.getString(it).also { value -> require(value.matches(Regex("[A-Za-z:]{1,48}"))) }
        }
        val fingerprint = text(json, "fingerprint", 64, true)!!
            .also { require(it.matches(Regex("[a-f0-9]{64}"))) }
        val reference = text(json, "reference", 128)?.also {
            require(it.matches(Regex("[A-Za-z0-9._/-]+")))
        }
        val originalReference = text(json, "originalReference", 128)?.also {
            require(it.matches(Regex("[A-Za-z0-9._/-]+")))
        }
        val party = text(json, "counterparty", 256)
        require(!SensitiveFilter.excludes(listOfNotNull(reference, originalReference, party).joinToString(" ")))
        val currency = text(json, "currency", 3)?.also { require(it == "KES") }
        val amount = minor(json, "amount")
        require(amount == null || amount > 0)
        if (validation == "valid") {
            require(amount != null && currency != null && reference != null && occurred != null &&
                direction != "unknown" && kind != "unknown" && missingValues.isEmpty())
        }
        return Candidate(id, source, parser, text(json, "parserVersion", 20, true)!!,
            captured, occurred, reference, amount, currency, direction, kind, party,
            minor(json, "fee"), minor(json, "balance"), confidence, missingValues, validation,
            fingerprint, originalReference, if (allowRaw) text(json, "raw", 8192) else null)
    }

    fun batch(candidates: List<Candidate>): String {
        require(candidates.size in 1..MAX_BATCH)
        val identity = candidates.sortedBy { it.id }.joinToString("\n") { "${it.id}:${it.fingerprint}" }
        return JSONObject().apply {
            put("format", "pennywise-notification-batch"); put("version", 1)
            put("batchId", UUID.nameUUIDFromBytes(identity.toByteArray()).toString())
            put("createdAt", Instant.now().toString())
            put("candidates", JSONArray().apply { candidates.forEach { put(candidate(it)) } })
        }.toString(2).also { require(it.toByteArray().size <= MAX_FILE_BYTES) }
    }

    fun readBatch(value: String, allowRaw: Boolean): List<Candidate> {
        require(value.toByteArray().size <= MAX_FILE_BYTES)
        BoundedIo.requireShallowJson(value)
        val json = JSONObject(value)
        require(json.get("format") == "pennywise-notification-batch" && json.get("version") == 1)
        UUID.fromString(json.getString("batchId")); Instant.parse(json.getString("createdAt"))
        val array = json.getJSONArray("candidates")
        require(array.length() in 1..MAX_BATCH)
        return (0 until array.length()).map { readCandidate(array.getJSONObject(it), allowRaw) }.also {
            require(it.map { item -> item.id }.distinct().size == it.size)
        }
    }
}
