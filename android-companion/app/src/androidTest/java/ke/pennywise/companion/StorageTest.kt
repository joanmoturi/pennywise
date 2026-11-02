package ke.pennywise.companion

import android.test.AndroidTestCase
import android.os.UserManager
import android.security.keystore.KeyInfo
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory

@Suppress("DEPRECATION")
class StorageTest : AndroidTestCase() {
    private lateinit var store: QueueStore
    private lateinit var name: String
    private lateinit var alias: String
    private lateinit var crypto: CryptoBox

    override fun setUp() {
        super.setUp()
        name = "test-${UUID.randomUUID()}.db"
        alias = "test-${UUID.randomUUID()}"
        crypto = CryptoBox(alias)
        store = QueueStore(context, name, crypto)
    }
    override fun tearDown() {
        store.close()
        context.deleteDatabase(name)
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        super.tearDown()
    }
    private fun candidate(amount: String = "12.34", raw: Boolean = false) = GenericParser().parse(
        Source("synthetic.example", "TEST"),
        "SYNTHETIC|Amount=$amount|Currency=KES|Ref=TEST001|Date=2026-11-02T18:00:00Z|" +
            "Direction=credit|Kind=received", System.currentTimeMillis(), raw)!!

    fun testGcmRandomIvRoundTripAndTamperRejection() {
        val first = crypto.encrypt("TEST private value", "test")
        val second = crypto.encrypt("TEST private value", "test")
        assertFalse(first.contentEquals(second))
        assertEquals("TEST private value", crypto.decrypt(first, "test"))
        first[first.lastIndex] = (first.last().toInt() xor 1).toByte()
        try { crypto.decrypt(first, "test"); fail("Tamper accepted") } catch (_: javax.crypto.AEADBadTagException) { }
        try { crypto.decrypt(second, "other"); fail("Wrong AAD accepted") } catch (_: javax.crypto.AEADBadTagException) { }
    }

    fun testQueueKeyHasNoPerUseAuthenticationAndUsesCredentialStorage() {
        assertFalse(context.isDeviceProtectedStorage)
        assertTrue(context.getSystemService(UserManager::class.java).isUserUnlocked)
        val encrypted = crypto.encrypt("TEST after first unlock", "test")
        val key = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null) as SecretKey
        val info = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
            .getKeySpec(key, KeyInfo::class.java) as KeyInfo
        assertFalse(info.isUserAuthenticationRequired)
        assertEquals(256, info.keySize)
        assertEquals("TEST after first unlock", crypto.decrypt(encrypted, "test"))
    }

    fun testEncryptedQueueConfigPersistenceAndIdempotentRestore() {
        val original = candidate()
        store.saveConfig(Config(sources = listOf(Source("synthetic.example", "TEST"))))
        assertEquals(DedupAction.INSERT, store.record(original))
        store.close()
        store = QueueStore(context, name, crypto)
        assertEquals("TEST", store.readConfig().sources.single().displayName)
        assertTrue(store.readConfig().paused)
        assertEquals(original.id, store.pending().single().id)
        assertEquals(DedupAction.DUPLICATE, store.record(candidate()))
        val recovery = JsonCodec.readBatch(JsonCodec.batch(store.pending()), false)
        store.restore(recovery)
        assertEquals(1, store.pending().size)
        store.readableDatabase.rawQuery("SELECT body FROM queue", null).use {
            assertTrue(it.moveToFirst())
            assertFalse(it.getBlob(0).toString(Charsets.ISO_8859_1).contains("TEST001"))
        }
    }

    fun testChangedReferenceIsSeparateReviewVersionAndReceiptsNeverDeleteOtherVersion() {
        val original = candidate()
        store.record(original)
        val update = candidate("13")
        assertEquals(DedupAction.UPDATE, store.record(update))
        assertEquals(2, store.pending().size)
        assertTrue(store.pending().first { it.id == update.id }.missing.contains("updatedReference"))
        store.acknowledge(listOf(original))
        assertEquals(update.id, store.pending().single().id)
        assertEquals(DedupAction.DUPLICATE, store.record(original))
    }

    fun testReceiptRequiresExactCurrentFingerprint() {
        val original = candidate()
        store.record(original)
        store.acknowledge(listOf(original.copy(fingerprint = "0".repeat(64))))
        assertEquals(1, store.pending().size)
        store.acknowledge(listOf(original))
        assertTrue(store.pending().isEmpty())
    }

    fun testRestorePreservesIdsAndRollsBackConflictingPayloads() {
        val original = candidate()
        store.record(original)
        val restored = candidate("14")
        val conflict = candidate("15").copy(id = original.id)
        try { store.restore(listOf(restored, conflict)); fail("Conflict accepted") } catch (_: IllegalArgumentException) { }
        assertEquals(listOf(original.id), store.pending().map { it.id })
        store.deleteAll()
        store.restore(listOf(restored))
        assertEquals(restored.id, store.pending().single().id)
    }

    fun testRawPruningNeverDeletesPendingPayload() {
        val original = candidate(raw = true)
        store.record(original)
        store.pruneRaw(System.currentTimeMillis(), Config(retainRaw = false))
        assertNull(store.pending().single().raw)
        assertEquals(original.id, store.pending().single().id)
    }

    fun testPayloadContractHasOmittedOptionalsStableRetryIdsAndBounds() {
        val original = candidate()
        val batch = JSONObject(JsonCodec.batch(listOf(original)))
        val item = batch.getJSONArray("candidates").getJSONObject(0)
        assertFalse(item.has("raw")); assertFalse(item.has("originalReference"))
        assertEquals(1234L, item.getLong("amount"))
        assertEquals(original.id, JsonCodec.readBatch(batch.toString(), false).single().id)
        assertEquals(batch.getString("batchId"),
            JSONObject(JsonCodec.batch(listOf(original))).getString("batchId"))
        item.put("amount", 12.34)
        try { JsonCodec.readBatch(batch.toString(), false); fail("Fractional minor units accepted") } catch (_: IllegalArgumentException) { }
        try { JsonCodec.batch(List(101) { original.copy(id = UUID.randomUUID().toString()) }); fail("Oversize batch") }
        catch (_: IllegalArgumentException) { }
    }

    fun testProviderUsesReadOnlyContentUriAndExpiry() {
        val intent = PrivateFileProvider.shareIntent(context, JsonCodec.batch(listOf(candidate())))
        val uri = intent.clipData!!.getItemAt(0).uri
        assertEquals("content", uri.scheme)
        context.contentResolver.openInputStream(uri)!!.use { assertTrue(it.read() >= 0) }
        try {
            context.contentResolver.openOutputStream(uri)?.close()
            fail("Provider accepted write")
        } catch (_: Exception) { }
        PrivateFileProvider.cleanup(context, true)
        try { context.contentResolver.openInputStream(uri); fail("Deleted handoff readable") }
        catch (_: Exception) { }
    }
}
