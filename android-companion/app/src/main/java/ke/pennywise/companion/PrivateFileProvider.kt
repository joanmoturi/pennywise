package ke.pennywise.companion

import android.content.ClipData
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID

/** Deliberately only serves generated JSON from one private directory, read-only. */
class PrivateFileProvider : ContentProvider() {
    override fun attachInfo(context: Context, info: ProviderInfo) {
        require(!info.exported && info.grantUriPermissions)
        super.attachInfo(context, info)
    }
    override fun onCreate() = true
    private fun file(uri: Uri): File {
        val ctx = requireNotNull(context)
        require(uri.scheme == "content" && uri.authority == "${ctx.packageName}.files")
        require(uri.pathSegments.size == 1 && uri.pathSegments[0].matches(Regex("[a-f0-9-]{36}\\.json")))
        val directory = File(ctx.cacheDir, "handoffs")
        val file = File(directory, uri.pathSegments[0])
        require(file.canonicalFile.parentFile == directory.canonicalFile)
        if (!file.isFile || System.currentTimeMillis() - file.lastModified() > EXPIRY_MS) {
            throw FileNotFoundException("Handoff expired; export again from companion")
        }
        return file
    }
    override fun getType(uri: Uri): String { file(uri); return "application/json" }
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        require(mode == "r")
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY)
    }
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?,
                       selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val file = file(uri)
        val columns = projection?.filter { it in listOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE) }
            ?.toTypedArray() ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns).apply {
            addRow(columns.map { if (it == OpenableColumns.DISPLAY_NAME) "pennywise-pending.json" else file.length() })
        }
    }
    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()

    companion object {
        const val EXPIRY_MS = 10 * 60 * 1000L
        fun cleanup(context: Context, all: Boolean = false) {
            File(context.cacheDir, "handoffs").listFiles()?.forEach { file ->
                if (all || System.currentTimeMillis() - file.lastModified() > EXPIRY_MS) {
                    val uri = Uri.Builder().scheme("content").authority("${context.packageName}.files")
                        .appendPath(file.name).build()
                    context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    file.delete()
                }
            }
        }
        fun shareIntent(context: Context, payload: String): Intent {
            cleanup(context, true)
            val directory = File(context.cacheDir, "handoffs").apply { check(mkdirs() || isDirectory) }
            val file = File(directory, "${UUID.randomUUID()}.json")
            file.writeText(payload, Charsets.UTF_8)
            val uri = Uri.Builder().scheme("content").authority("${context.packageName}.files")
                .appendPath(file.name).build()
            return Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri("Pennywise pending candidates", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
    }
}
