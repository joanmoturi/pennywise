package ke.pennywise.companion

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class CoreTest {
    private val source = Source(SmsSenders.sourceId("testbank"), "Synthetic",
        enabled = true, activatedAt = 1_000, senderId = "testbank")
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
        assertEquals(Hashes.fingerprint(source.sourceId, complete), result.fingerprint)
        assertTrue(result.fingerprint.matches(Regex("[a-f0-9]{64}")))
        assertEquals(Hashes.fingerprint("a.b", " a  b\nc "), Hashes.fingerprint("a.b", "a b c"))
        assertNotEquals(Hashes.fingerprint("a.b", complete), Hashes.fingerprint("a.c", complete))
    }

    private fun permitted(config: Config = Config(paused = false, sources = listOf(source)),
                          sender: String = "TESTBANK", receivedAt: Long = 9_000,
                          permission: Boolean = true) =
        CaptureGate.source(config, sender, receivedAt, permission) != null

    @Test fun gateAcceptsOnlyNewAllowedSmsWithPermission() {
        assertTrue(permitted())
        assertFalse(permitted(sender = "UNAPPROVED"))
        assertFalse(permitted(config = Config(sources = listOf(source))))
        assertFalse(permitted(config = Config(paused = false, sources = listOf(source.copy(enabled = false)))))
        assertFalse(permitted(permission = false))
        assertFalse(permitted(config = Config(paused = false, sources = listOf(
            Source("legacy.example", "Legacy", enabled = true)))))
    }

    @Test fun deviceReadinessAllowsRelockAfterFirstUnlockButNeverDirectBoot() {
        assertFalse(CaptureGate.deviceReady(userUnlocked = false, secureDevice = true, deviceProtectedStorage = false))
        // isUserUnlocked remains true when the screen subsequently locks; screen state is not a gate.
        assertTrue(CaptureGate.deviceReady(userUnlocked = true, secureDevice = true, deviceProtectedStorage = false))
        assertFalse(CaptureGate.deviceReady(userUnlocked = true, secureDevice = false, deviceProtectedStorage = false))
        assertFalse(CaptureGate.deviceReady(userUnlocked = true, secureDevice = true, deviceProtectedStorage = true))
    }

    @Test fun gateRejectsActivationBoundaryAndRevokedPermission() {
        assertFalse(permitted(receivedAt = 1_000))
        assertFalse(permitted(receivedAt = 999))
        assertTrue(permitted())
        assertFalse(permitted(permission = false))
        assertFalse(permitted(config = Config(paused = true, sources = listOf(source))))
    }

    @Test fun senderNormalizationIsCarefulAndNeverGuessesCountryCodes() {
        assertEquals("testbank", SmsSenders.normalize(" TestBank "))
        assertEquals("+254700000000", SmsSenders.normalize("+254 (700) 000-000"))
        assertEquals("12345", SmsSenders.normalize("12-345"))
        assertEquals("test bank", SmsSenders.normalize("TEST  BANK"))
        assertNotEquals(SmsSenders.normalize("M-PESA"), SmsSenders.normalize("MPESA"))
        assertNotEquals(SmsSenders.normalize("0700000000"), SmsSenders.normalize("+254700000000"))
        assertNotEquals(SmsSenders.normalize("00123"), SmsSenders.normalize("+123"))
        listOf("", "++123", "12", "*123#", "BANK\u200B", "\u0422ESTBANK", "\tTESTBANK", "\u00A0TESTBANK")
            .forEach { assertNull(SmsSenders.normalize(it)) }
    }

    @Test fun duplicateNormalizedSendersCannotPassAmbiguousAllowlist() {
        assertFalse(permitted(config = Config(paused = false, sources = listOf(source, source))))
        assertFalse(permitted(config = Config(paused = false, sources = listOf(source.copy(sourceId = "other.source")))))
    }

    @Test fun multipartGsmAndUnicodeJoinInFrameworkOrder() {
        val first = complete.take(100)
        val last = complete.drop(100) + "|Account=TEST wallet"
        val message = SmsAssembly.assemble(listOf(SmsPart("TESTBANK", now - 1, first),
            SmsPart("testbank", now, last)), "3gpp", now)
        assertEquals(first + last, message.body)
        val parsed = GenericParser().parse(source, message.body, now, false)!!
        assertEquals("TEST wallet", parsed.accountHint)
        assertEquals(95, parsed.confidence)
        assertEquals("Jambo \u20AC", SmsAssembly.assemble(listOf(SmsPart("TESTBANK", now, "Jambo \u20AC")), "3gpp2", now).body)
    }

    @Test fun malformedAndMixedSenderMultipartIsRejected() {
        listOf(emptyList(), listOf(SmsPart("TESTBANK", now, null)),
            listOf(SmsPart("TESTBANK", now, "")),
            listOf(SmsPart("TESTBANK", now, "a"), SmsPart("OTHER", now, "b")),
            List(33) { SmsPart("TESTBANK", now, "a") }).forEach { parts ->
            assertThrows(SmsInputException::class.java) { SmsAssembly.assemble(parts, "3gpp", now) }
        }
    }

    @Test fun timestampIsValidatedButNeverSubstitutedForTransactionDate() {
        listOf(0L, -1L, now + 300_001).forEach {
            val failure = assertThrows(SmsInputException::class.java) {
                SmsAssembly.assemble(listOf(SmsPart("TESTBANK", it, complete)), "3gpp", now)
            }
            assertEquals(SmsFailure.INVALID_TIMESTAMP, failure.reason)
        }
        val message = SmsAssembly.assemble(listOf(SmsPart("TESTBANK", 1,
            "SYNTHETIC|Kind=received|Amount=12|Currency=KES|Ref=TEST")), "3gpp", now)
        val parsed = GenericParser().parse(source, message.body, now, false)!!
        assertNull(parsed.occurredAt)
        assertTrue("occurredAt" in parsed.missing)
    }

    @Test fun unsupportedFormatAndUndecodableTextFailClosed() {
        listOf(null, "utf8", "").forEach { format ->
            assertEquals(SmsFailure.UNSUPPORTED_ENCODING, assertThrows(SmsInputException::class.java) {
                SmsAssembly.assemble(listOf(SmsPart("TESTBANK", now, "TEST")), format, now)
            }.reason)
        }
        listOf("\uFFFD", "\u0000", "\uD800").forEach { body ->
            assertThrows(SmsInputException::class.java) {
                SmsAssembly.assemble(listOf(SmsPart("TESTBANK", now, body)), "3gpp", now)
            }
        }
    }

    @Test fun repeatedSmsBroadcastHasStableFingerprintWithoutReceiptTime() {
        val first = GenericParser().parse(source, complete, now, false)!!
        val retry = GenericParser().parse(source, complete, now + 30_000, false)!!
        assertNotEquals(first.id, retry.id)
        assertEquals(first.fingerprint, retry.fingerprint)
        assertEquals(DedupAction.DUPLICATE, DedupPolicy.action(first.fingerprint == retry.fingerprint, false))
    }

    @Test fun syntheticSmsCategoriesAndUnknownChargesRemainExplicit() {
        mapOf("received" to "credit", "sent" to "debit", "deposit" to "credit", "withdrawal" to "debit",
            "transfer" to "debit", "charge" to "debit", "loan_repayment" to "credit", "coupon" to "credit").forEach { (kind, direction) ->
            val parsed = GenericParser().parse(source, complete.replace("Kind=received", "Kind=$kind")
                .replace("Direction=credit", "Direction=$direction").replace("|Fee=0", ""), now, false)!!
            assertEquals(kind, parsed.kind)
            assertNull(parsed.fee)
            assertEquals("valid", parsed.validation)
        }
        val ambiguous = GenericParser().parse(source, complete.replace("Direction=credit", "Direction=unknown"), now, false)!!
        assertEquals("incomplete", ambiguous.validation)
        assertTrue(ambiguous.confidence < 90)
        val contradictory = GenericParser().parse(source, complete.replace("Kind=received", "Kind=sent"), now, false)!!
        assertTrue("ambiguous:direction" in contradictory.missing)
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
