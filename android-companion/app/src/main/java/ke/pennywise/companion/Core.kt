package ke.pennywise.companion

import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

const val MAX_SAFE_MINOR = 9_007_199_254_740_991L
val KINDS = setOf("received", "sent", "withdrawal", "deposit", "transfer", "merchant",
    "paybill", "buy_goods", "charge", "loan_repayment", "interest", "coupon", "refund",
    "principal", "reversal", "failed", "balance", "unknown")
val DIRECTIONS = setOf("credit", "debit", "unknown")

data class Source(
    val packageName: String,
    val displayName: String,
    val profile: String = "generic",
    val enabled: Boolean = false,
    val activatedAt: Long = 0,
    val previewAvailable: Boolean = false,
    val prefix: String = "SYNTHETIC",
    val delimiter: String = "|",
    val labels: Map<String, String> = DEFAULT_LABELS
) {
    companion object {
        val DEFAULT_LABELS = linkedMapOf("amount" to "Amount", "currency" to "Currency",
            "reference" to "Ref", "occurredAt" to "Date", "direction" to "Direction",
            "kind" to "Kind", "counterparty" to "Party", "fee" to "Fee",
            "balance" to "Balance", "originalReference" to "OriginalRef")
    }
}

data class Config(
    val paused: Boolean = true,
    val retainRaw: Boolean = false,
    val retentionDays: Int = 7,
    val sources: List<Source> = emptyList(),
    val revision: Long = 0
)

data class Candidate(
    val id: String = UUID.randomUUID().toString(),
    val source: String,
    val parserId: String,
    val parserVersion: String = "1",
    val capturedAt: String,
    val occurredAt: String? = null,
    val reference: String? = null,
    val amount: Long? = null,
    val currency: String? = null,
    val direction: String = "unknown",
    val kind: String = "unknown",
    val counterparty: String? = null,
    val fee: Long? = null,
    val balance: Long? = null,
    val confidence: Int,
    val missing: List<String>,
    val validation: String,
    val fingerprint: String,
    val originalReference: String? = null,
    val raw: String? = null
)

object Hashes {
    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    fun normalize(text: String): String = text.trim().replace(Regex("\\s+"), " ")
    fun fingerprint(source: String, text: String): String = sha256("$source\n${normalize(text)}")
    fun reference(candidate: Candidate): String? =
        candidate.reference?.let { sha256("${candidate.source}\n$it") }
}

object CaptureGate {
    fun deviceReady(userUnlocked: Boolean, secureDevice: Boolean, deviceProtectedStorage: Boolean): Boolean =
        userUnlocked && secureDevice && !deviceProtectedStorage

    fun permits(config: Config, packageName: String, postTime: Long, now: Long,
                connectedAt: Long, permission: Boolean, summary: Boolean): Boolean {
        val source = config.sources.firstOrNull { it.packageName == packageName } ?: return false
        return permission && !config.paused && source.enabled && !summary &&
            connectedAt > 0 && postTime > maxOf(connectedAt, source.activatedAt) &&
            postTime <= now + 5_000 && now - postTime <= 120_000
    }
}

object SensitiveFilter {
    private val secret = Regex(
        "\\b(otp|pin|password|passcode|verification|authenticate|authentication|login|log[ -]?in|one[ -]?time|security code|reset code)\\b",
        RegexOption.IGNORE_CASE
    )
    fun excludes(text: String): Boolean = text.length > 8192 || secret.containsMatchIn(text)
}

interface FinancialParser {
    val profile: String
    fun parse(source: Source, text: String, now: Long, retainRaw: Boolean): Candidate?
}

open class LabelledParser(override val profile: String) : FinancialParser {
    override fun parse(source: Source, text: String, now: Long, retainRaw: Boolean): Candidate? {
        if (SensitiveFilter.excludes(text)) return null
        val trimmed = text.trim()
        if (!trimmed.startsWith(source.prefix + source.delimiter)) return null
        if (!validProfile(source)) return null
        val fields = mutableMapOf<String, String>()
        val duplicates = mutableSetOf<String>()
        trimmed.removePrefix(source.prefix + source.delimiter).split(source.delimiter).forEach { segment ->
            val pair = segment.split("=", limit = 2)
            if (pair.size == 2) {
                val key = source.labels.entries.firstOrNull { it.value.equals(pair[0].trim(), true) }?.key
                if (key != null) {
                    if (fields.containsKey(key)) duplicates.add(key)
                    fields[key] = pair[1].trim().take(256)
                }
            }
        }
        val kind = fields["kind"]?.lowercase()?.takeIf { it in KINDS } ?: "unknown"
        // A prefix alone is not financial evidence. Balance-only messages are never queued.
        val actionable = kind !in setOf("unknown", "balance") ||
            fields.containsKey("amount") || fields.containsKey("reference")
        if (!actionable || kind == "balance" ||
            (kind == "unknown" && fields.containsKey("balance") && !fields.containsKey("amount"))) return null
        val missing = mutableListOf<String>()
        val amount = fields["amount"]?.let(::minorUnits)?.takeIf { it > 0 }
        if (amount == null) missing.add("amount")
        val currency = fields["currency"]?.takeIf { it == "KES" }
        if (currency == null) missing.add("currency")
        val ref = fields["reference"]?.takeIf { it.matches(Regex("[A-Za-z0-9._/-]{1,128}")) }
        if (ref == null) missing.add("reference")
        val date = fields["occurredAt"]?.let {
            runCatching { Instant.parse(it).toString() }.getOrNull()
        }
        if (date == null) missing.add("occurredAt")
        val direction = fields["direction"]?.lowercase()?.takeIf { it in DIRECTIONS } ?: "unknown"
        if (direction == "unknown") missing.add("direction")
        if (kind == "unknown") missing.add("kind")
        val fee = fields["fee"]?.let(::minorUnits)
        val balance = fields["balance"]?.let(::minorUnits)
        if (fields.containsKey("fee") && fee == null) missing.add("fee")
        if (fields.containsKey("balance") && balance == null) missing.add("balance")
        val originalReference = fields["originalReference"]?.takeIf {
            it.matches(Regex("[A-Za-z0-9._/-]{1,128}"))
        }
        if (kind == "reversal" && originalReference == null) missing.add("originalReference")
        duplicates.forEach { missing.add("ambiguous:$it") }
        val incomplete = missing.isNotEmpty() || kind in setOf("failed", "reversal")
        return Candidate(source = source.packageName, parserId = "$profile-labelled",
            capturedAt = Instant.ofEpochMilli(now).toString(), occurredAt = date,
            reference = ref, amount = amount, currency = currency, direction = direction,
            kind = kind, counterparty = fields["counterparty"]?.takeIf { it.isNotBlank() }, fee = fee, balance = balance,
            confidence = if (incomplete) 35 else 85, missing = missing.distinct(),
            validation = if (incomplete) "incomplete" else "valid",
            fingerprint = Hashes.fingerprint(source.packageName, text),
            originalReference = originalReference, raw = if (retainRaw) text else null)
    }

    companion object {
        fun minorUnits(value: String): Long? = runCatching {
            require(value.matches(Regex("[0-9]{1,14}(\\.[0-9]{1,2})?")))
            BigDecimal(value).setScale(2, RoundingMode.UNNECESSARY)
                .movePointRight(2).longValueExact().also { require(it in 0..MAX_SAFE_MINOR) }
        }.getOrNull()

        fun validProfile(source: Source): Boolean =
            source.profile in setOf("mpesa", "equity", "kcb", "generic") &&
                source.prefix.matches(Regex("[A-Za-z0-9 _-]{4,48}")) &&
                source.delimiter.length == 1 && source.delimiter in listOf("|", ";", "~") &&
                source.labels.keys == Source.DEFAULT_LABELS.keys &&
                source.labels.values.all { it.matches(Regex("[A-Za-z][A-Za-z0-9 _-]{0,31}")) } &&
                source.labels.values.map { it.lowercase() }.distinct().size == source.labels.size
    }
}

class MpesaParser : LabelledParser("mpesa")
class EquityParser : LabelledParser("equity")
class KcbParser : LabelledParser("kcb")
class GenericParser : LabelledParser("generic")

object Parsers {
    private val parsers = listOf(MpesaParser(), EquityParser(), KcbParser(), GenericParser())
    fun forSource(source: Source): FinancialParser = parsers.first { it.profile == source.profile }
}

enum class DedupAction { INSERT, DUPLICATE, UPDATE }
object DedupPolicy {
    fun action(contentSeen: Boolean, referenceSeen: Boolean): DedupAction =
        if (contentSeen) DedupAction.DUPLICATE
        else if (referenceSeen) DedupAction.UPDATE
        else DedupAction.INSERT
}

object ShareGate {
    fun permits(hasActiveNetwork: Boolean): Boolean = !hasActiveNetwork
}
