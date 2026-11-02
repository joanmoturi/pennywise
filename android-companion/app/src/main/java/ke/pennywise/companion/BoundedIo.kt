package ke.pennywise.companion

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

object BoundedIo {
    fun requireShallowJson(value: String, maxDepth: Int = 8) {
        var depth = 0
        var quoted = false
        var escaped = false
        value.forEach { char ->
            if (quoted) {
                if (escaped) escaped = false
                else if (char == '\\') escaped = true
                else if (char == '"') quoted = false
            } else when (char) {
                '"' -> quoted = true
                '{', '[' -> { depth++; require(depth <= maxDepth) }
                '}', ']' -> { depth--; require(depth >= 0) }
            }
        }
        require(depth == 0 && !quoted)
    }

    fun readUtf8(input: InputStream, limit: Int): String {
        require(limit > 0)
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        var total = 0
        while (true) {
            val read = input.read(buffer, 0, minOf(buffer.size, limit - total + 1))
            if (read == -1) break
            require(read > 0)
            total += read
            require(total <= limit)
            output.write(buffer, 0, read)
        }
        return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(output.toByteArray())).toString()
    }
}
