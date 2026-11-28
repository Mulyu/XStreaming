package com.xstreaming.settings

import com.google.common.primitives.Longs
import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import com.xstreaming.JoseStuff
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.net.URL
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import java.util.Base64
import java.util.UUID

data class XalCodeChallenge(val value: String, val method: String, val verifier: String)

/**
 * Kotlin port of XalManager.java's ECDSA P-256 signing for Xbox Live's
 * device-auth/SISU/XSTS requests. A fresh instance per sign-in attempt,
 * matching Xal.ts's own `constructor() { XalManager.init() }` -- a new
 * keypair every attempt, held for that attempt's whole lifetime (every
 * signed call across one flow must use the SAME key, since the
 * device-auth call's ProofKey.x/y has to match whatever key actually
 * signs every later call too), not a process-wide singleton. Reuses
 * JoseStuff.java's DER->JOSE signature conversion as-is (already a plain,
 * dependency-free Java class, no changes needed). No RN bridge:
 * XalManager.java's own methods never actually read its
 * ReactApplicationContext constructor parameter either, but a clean
 * reimplementation here avoids having to manufacture one just to
 * instantiate that RN-module class from Kotlin.
 */
class XalCrypto {
    private val publicKey: ECPublicKey
    private val privateKey: ECPrivateKey

    init {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1")) // P-256
        val keyPair = generator.generateKeyPair()
        publicKey = keyPair.public as ECPublicKey
        privateKey = keyPair.private as ECPrivateKey
    }

    // P-256's coordinate width. A JWK's x/y MUST be this many bytes, always
    // -- unlike XalManager.java's own bigIntegerToByteArray (which this
    // fixes rather than reproduces: it only ever strips one leading
    // sign byte and never pads, so roughly 1 in 256 affine coordinates --
    // any below 2^248 -- would come out short and produce a malformed
    // ProofKey that Xbox Live's signature verification could reject,
    // causing an intermittent, hard-to-reproduce sign-in failure).
    private val EC_COORDINATE_SIZE = 32

    private fun fixedWidthUnsignedBytes(value: BigInteger, width: Int): ByteArray {
        var bytes = value.toByteArray() // two's-complement; may carry a leading 0x00 sign byte
        if (bytes.size > width && bytes[0].toInt() == 0) {
            bytes = bytes.copyOfRange(1, bytes.size)
        }
        if (bytes.size == width) {
            return bytes
        }
        if (bytes.size > width) {
            // Shouldn't happen for a valid P-256 coordinate, but trim from
            // the left rather than return an over-wide value.
            return bytes.copyOfRange(bytes.size - width, bytes.size)
        }
        val padded = ByteArray(width)
        System.arraycopy(bytes, 0, padded, width - bytes.size, bytes.size)
        return padded
    }

    private fun base64UrlNoPadding(bytes: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    val keyX: String get() = base64UrlNoPadding(fixedWidthUnsignedBytes(publicKey.w.affineX, EC_COORDINATE_SIZE))
    val keyY: String get() = base64UrlNoPadding(fixedWidthUnsignedBytes(publicKey.w.affineY, EC_COORDINATE_SIZE))

    fun nextUuid(): String = UUID.randomUUID().toString()

    // Windows-epoch timestamp, the same offset XalManager.java's own
    // windowsTimestamp() uses -- Xbox Live's signature scheme is a
    // Windows-flavored timestamp (FILETIME-ish 100ns ticks since
    // 1601-01-01), not plain Unix epoch seconds/millis.
    private fun windowsTimestamp(): Long = (Instant.now().epochSecond + 11644473600L) * 10000000L

    fun sign(url: String, authorizationToken: String, postData: String): String {
        val currentTime = windowsTimestamp()
        val bytesToSign = ByteArrayOutputStream()
        bytesToSign.write(byteArrayOf(0, 0, 0, 1, 0))
        bytesToSign.write(Longs.toByteArray(currentTime))
        bytesToSign.write(byteArrayOf(0))

        bytesToSign.write("POST".toByteArray())
        bytesToSign.write(byteArrayOf(0))

        val pathAndQuery = URL(url).path ?: ""
        bytesToSign.write(pathAndQuery.toByteArray())
        bytesToSign.write(byteArrayOf(0))

        bytesToSign.write(authorizationToken.toByteArray())
        bytesToSign.write(byteArrayOf(0))

        // Re-serializes postData through the SAME Gson configuration
        // (HTML-escaping disabled) XalManager.java's own sign() does,
        // rather than signing the raw string as given -- the bytes this
        // signs must be exactly what this Gson round-trip produces, since
        // that's what the original, already-proven-working implementation
        // signs (and what Xbox Live's servers therefore expect).
        val normalGson = GsonBuilder().disableHtmlEscaping().create()
        val jsonObject = JsonParser.parseString(postData).asJsonObject
        bytesToSign.write(normalGson.toJson(jsonObject).toByteArray())
        bytesToSign.write(byteArrayOf(0))

        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey)
        signature.update(bytesToSign.toByteArray())
        val signatureBytes = JoseStuff.DERToJOSE(signature.sign(), JoseStuff.AlgorithmType.ECDSA256)

        val result = ByteArrayOutputStream()
        result.write(byteArrayOf(0, 0, 0, 1))
        result.write(Longs.toByteArray(currentTime))
        result.write(signatureBytes)
        return Base64.getEncoder().encodeToString(result.toByteArray())
    }

    fun codeChallenge(): XalCodeChallenge {
        val randomBytes = ByteArray(32)
        SecureRandom().nextBytes(randomBytes)
        val codeVerifier = base64UrlNoPadding(randomBytes)
        val digest = MessageDigest.getInstance("SHA-256").digest(codeVerifier.toByteArray())
        val codeChallengeValue = base64UrlNoPadding(digest)
        return XalCodeChallenge(value = codeChallengeValue, method = "S256", verifier = codeVerifier)
    }

    fun randomState(): String {
        val randomBytes = ByteArray(64)
        SecureRandom().nextBytes(randomBytes)
        return base64UrlNoPadding(randomBytes)
    }
}
