package ke.pennywise.companion

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class CoreTest {
    private val source = Source("synthetic.example", "Synthetic", enabled = true, activatedAt = 1_000)
    private val now = 10_000L
    private val complete = "SYNTHETIC|Amount=123.45|Currency=KES|Ref=TEST001|" +
        "Date=2026-11-02T18:00:00Z|Direction=credit|Kind=received|Party=TEST sender|Fee=0|Balance=900.10"

    @Test fun allModularProfilesParseExplicitSyntheticLabels() {
        listOf("mpesa", "equity", "kcb", "generic").forEach { profile ->
            val configured = source.copy(profile = profile)
            val result = Parsers.forSource(configured).parse(configured, complete, now, false)!!
            assertEquals(12345L, result.amount)
            assertEquals(0L, result.fee)
            assertEquals(90010L, result.balance)
            assertEquals("$profile-labelled", result.parserId)
            assertEquals("valid", result.validation)
            assertTrue(result.missing.isEmpty())
            assertNull(result.raw)
            assertNull(result.originalReference)
        }
    }

    @Test fun amountsAreExactSafeMinorUnits() {
        assertEquals(1L, LabelledParser.minorUnits("0.01"))
        assertEquals(100L, LabelledParser.minorUnits("1"))
        assertEquals(MAX_SAFE_MINOR, LabelledParser.minorUnits("90071992547409.91"))
        listOf("-1", "1.001", "1e2", "1,000.00", "NaN", "90071992547409.92", "100000000000000").forEach {
            assertNull(it, LabelledParser.minorUnits(it))
        }
    }

    @Test fun zeroAmountIsOmittedAndIncomplete() {
        val result = GenericParser().parse(source, complete.replace("123.45", "0"), now, false)!!
        assertNull(result.amount)
        assertTrue("amount" in result.missing)
        assertEquals("incomplete", result.validation)
    }

    @Test fun incompleteFinancialCandidatesHaveNoInventedReferenceOrDate() {
        val result = GenericParser().parse(source, "SYNTHETIC|Kind=sent|Amount=12.345|Currency=USD|Party=", now, false)!!
        assertNull(result.amount); assertNull(result.currency); assertNull(result.reference)
        assertNull(result.counterparty)
        assertNull(result.occurredAt)
        assertEquals("unknown", result.direction)
        assertEquals(setOf("amount", "currency", "reference", "occurredAt", "direction"), result.missing.toSet())
        assertEquals("incomplete", result.validation)
        assertTrue(result.confidence < 50)
    }

    @Test fun securityTextAlwaysExcludedEvenWithOptInRaw() {
        listOf("OTP 123456", "Your PIN is 1234", "password reset", "One-time code", "login",
            "verification code", "Authentication").forEach {
            assertNull(GenericParser().parse(source, "$complete|Party=$it", now, true))
        }
    }

    @Test fun unrelatedAndBalanceOnlyNeverQueued() {
        listOf("hello world", "Payment received KES 120", "SYNTHETIC|Party=Hello",
            "SYNTHETIC|Balance=1200|Currency=KES|Ref=TEST",
            "SYNTHETIC|Kind=balance|Amount=12|Ref=TEST").forEach {
            assertNull(GenericParser().parse(source, it, now, true))
        }
    }

    @Test fun overlongAndAmbiguousContentIsSafe() {
        assertNull(GenericParser().parse(source, complete + "x".repeat(8192), now, false))
        val ambiguous = GenericParser().parse(source, "$complete|Amount=150", now, false)!!
        assertEquals("incomplete", ambiguous.validation)
        assertTrue("ambiguous:amount" in ambiguous.missing)
    }

    @Test fun reversalAndFailedNeedReview() {
        val reversed = GenericParser().parse(source, complete.replace("Kind=received", "Kind=reversal"), now, false)!!
        assertEquals("incomplete", reversed.validation)
        assertTrue("originalReference" in reversed.missing)
        assertNull(reversed.originalReference)
        val failed = GenericParser().parse(source, "SYNTHETIC|Kind=failed|Ref=TEST002", now, false)!!
        assertEquals("failed", failed.kind)
        assertNull(failed.amount)
        assertEquals("incomplete", failed.validation)
    }

    @Test fun everyActionableKindRoundTripsThroughParser() {
        (KINDS - setOf("balance", "unknown")).forEach { kind ->
            assertEquals(kind, GenericParser().parse(source,
                complete.replace("Kind=received", "Kind=$kind"), now, false)!!.kind)
        }
    }

    @Test fun customLiteralProfileSupportsOnlyBoundedSafeLabels() {
        val customized = source.copy(prefix = "MYFORMAT", delimiter = ";",
            labels = source.labels + ("amount" to "Value"))
        assertTrue(LabelledParser.validProfile(customized))
        assertEquals(12345L, GenericParser().parse(customized,
            complete.replace("SYNTHETIC", "MYFORMAT").replace("|", ";").replace("Amount=", "Value="), now, false)!!.amount)
        assertFalse(LabelledParser.validProfile(source.copy(prefix = ".*")))
        assertFalse(LabelledParser.validProfile(source.copy(delimiter = "||")))
        assertFalse(LabelledParser.validProfile(source.copy(labels = source.labels + ("amount" to "Ref"))))
    }

    @Test fun malformedDateAndFeeStayIncomplete() {
        val result = GenericParser().parse(source, complete.replace("2026-11-02T18:00:00Z", "yesterday")
            .replace("Fee=0", "Fee=-5"), now, false)!!
        assertNull(result.occurredAt); assertNull(result.fee)
        assertTrue(result.missing.containsAll(listOf("occurredAt", "fee")))
    }

    @Test fun rawIsExplicitAndFingerprintIgnoresWhitespaceNotSource() {
        val result = GenericParser().parse(source, complete, now, true)!!
        assertEquals(complete, result.raw)
        assertEquals(Hashes.fingerprint(source.packageName, complete), result.fingerprint)
        assertTrue(result.fingerprint.matches(Regex("[a-f0-9]{64}")))
        assertEquals(Hashes.fingerprint("a.b", " a  b\nc "), Hashes.fingerprint("a.b", "a b c"))
        assertNotEquals(Hashes.fingerprint("a.b", complete), Hashes.fingerprint("a.c", complete))
    }

    private fun permitted(config: Config = Config(paused = false, sources = listOf(source)),
                          packageName: String = source.packageName, post: Long = 9_000,
                          connected: Long = 2_000, permission: Boolean = true, summary: Boolean = false) =
        CaptureGate.permits(config, packageName, post, now, connected, permission, summary)

    @Test fun gateAcceptsOnlyFutureActiveAllowlistedPosts() {
        assertTrue(permitted())
        assertFalse(permitted(packageName = "unrelated.example"))
        assertFalse(permitted(config = Config(sources = listOf(source))))
        assertFalse(permitted(config = Config(paused = false, sources = listOf(source.copy(enabled = false)))))
        assertFalse(permitted(permission = false))
        assertFalse(permitted(connected = 0))
        assertFalse(permitted(summary = true))
    }

    @Test fun deviceReadinessAllowsRelockAfterFirstUnlockButNeverDirectBoot() {
        assertFalse(CaptureGate.deviceReady(userUnlocked = false, secureDevice = true, deviceProtectedStorage = false))
        // isUserUnlocked remains true when the screen subsequently locks; screen state is not a gate.
        assertTrue(CaptureGate.deviceReady(userUnlocked = true, secureDevice = true, deviceProtectedStorage = false))
        assertFalse(CaptureGate.deviceReady(userUnlocked = true, secureDevice = false, deviceProtectedStorage = false))
        assertFalse(CaptureGate.deviceReady(userUnlocked = true, secureDevice = true, deviceProtectedStorage = true))
    }

    @Test fun gateRejectsHistoricalAndActivationBoundaryPosts() {
        assertFalse(permitted(post = 2_000))
        assertFalse(permitted(config = Config(paused = false,
            sources = listOf(source.copy(activatedAt = 9_000)))))
        assertFalse(CaptureGate.permits(Config(false, sources = listOf(source)), source.packageName,
            3_000, 200_000, 2_000, true, false))
        assertFalse(permitted(post = now + 5_001))
    }

    @Test fun dedupDistinguishesUpdatesAndUnreferencedNewContent() {
        assertEquals(DedupAction.INSERT, DedupPolicy.action(false, false))
        assertEquals(DedupAction.DUPLICATE, DedupPolicy.action(true, false))
        assertEquals(DedupAction.DUPLICATE, DedupPolicy.action(true, true))
        assertEquals(DedupAction.UPDATE, DedupPolicy.action(false, true))
        val original = GenericParser().parse(source, complete, now, false)!!
        val update = GenericParser().parse(source, complete.replace("123.45", "124"), now, false)!!
        assertEquals(Hashes.reference(original), Hashes.reference(update))
        assertNotEquals(original.fingerprint, update.fingerprint)
    }

    @Test fun boundedRecoveryRejectsOversizeAndInvalidUtf8() {
        assertEquals("abc", BoundedIo.readUtf8(ByteArrayInputStream("abc".toByteArray()), 3))
        assertThrows(IllegalArgumentException::class.java) {
            BoundedIo.readUtf8(ByteArrayInputStream("abcd".toByteArray()), 3)
        }
        assertThrows(java.nio.charset.CharacterCodingException::class.java) {
            BoundedIo.readUtf8(ByteArrayInputStream(byteArrayOf(0xc3.toByte(), 0x28)), 3)
        }
    }

    @Test fun shareGateRejectsEveryActiveNetwork() {
        assertTrue(ShareGate.permits(false))
        assertFalse(ShareGate.permits(true))
    }

    @Test fun recoveryDepthGuardIgnoresQuotedBracesAndRejectsNestedBombs() {
        BoundedIo.requireShallowJson("{\"text\":\"[[[[[[[[[\",\"list\":[1]}")
        assertThrows(IllegalArgumentException::class.java) {
            BoundedIo.requireShallowJson("[".repeat(9) + "]".repeat(9))
        }
        assertThrows(IllegalArgumentException::class.java) { BoundedIo.requireShallowJson("{\"unterminated") }
    }
}
