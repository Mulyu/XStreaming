package com.xstreaming.gfn

/**
 * SDP helpers for the GFN WebRTC answer -- a Kotlin port of
 * features/gfn-session/lib/nvstSdp.ts and lib/micSdp.ts. Keep both pairs in
 * sync: GFN's server expects byte-identical munging regardless of which
 * client produced the answer.
 */

private const val OFFICIAL_MIN_BITRATE_KBPS = 4000
private const val HID_DEVICE_MASK_ALL = 0x7fffffff

data class IceCredentials(val ufrag: String, val pwd: String, val fingerprint: String)

data class NvstParams(
    val width: Int,
    val height: Int,
    val fps: Int,
    val maxBitrateKbps: Int,
    val partialReliableThresholdMs: Int,
    val codec: String, // "H264" | "H265" | "AV1"
    val credentials: IceCredentials,
)

// Extract ICE ufrag/pwd and the DTLS fingerprint from a local SDP.
fun extractIceCredentials(sdp: String): IceCredentials {
    val ufrag = Regex("a=ice-ufrag:(.*)").find(sdp)?.groupValues?.get(1)?.trim() ?: ""
    val pwd = Regex("a=ice-pwd:(.*)").find(sdp)?.groupValues?.get(1)?.trim() ?: ""
    val fingerprint = Regex("a=fingerprint:(.*)").find(sdp)?.groupValues?.get(1)?.trim() ?: ""
    return IceCredentials(ufrag, pwd, fingerprint)
}

// Reorder the answer's m=video payload types so codecName's are tried first.
// Android's PeerConnection.createAnswer() has no codec preference of its own --
// if the server's offer lists a codec we can only decode in software ahead of
// H264, createAnswer() can land on it. Mirrors what xCloud's own setCodec()
// does for its offer.
fun preferVideoCodec(sdp: String, codecName: String): String {
    val lineEnding = if (sdp.contains("\r\n")) "\r\n" else "\n"
    val lines = sdp.split(Regex("\r?\n")).toMutableList()
    val rtpmapPattern = Regex("^a=rtpmap:(\\d+) $codecName/", RegexOption.IGNORE_CASE)
    val preferredIds = mutableListOf<String>()
    for (line in lines) {
        val match = rtpmapPattern.find(line)
        if (match != null) {
            preferredIds.add(match.groupValues[1])
        }
    }
    // codecName isn't in this answer's capabilities at all -- nothing to do.
    if (preferredIds.isEmpty()) {
        return sdp
    }

    for (i in lines.indices) {
        if (!lines[i].startsWith("m=video")) {
            continue
        }
        val tmp = lines[i].trim().split(" ")
        var ids = tmp.drop(3)
        ids = ids.filterNot { preferredIds.contains(it) }
        ids = preferredIds + ids
        lines[i] = (tmp.take(3) + ids).joinToString(" ")
        break
    }

    return lines.joinToString(lineEnding)
}

// Munge the WebRTC answer (not the nvstSdp blob) to match the official GFN web
// client: a "b=AS:<kbps>" bandwidth line after each m= section, and
// "stereo=1" on the opus fmtp line.
fun mungeAnswerSdp(sdp: String, maxBitrateKbps: Int): String {
    val lineEnding = if (sdp.contains("\r\n")) "\r\n" else "\n"
    val lines = sdp.split(Regex("\r?\n"))
    val result = mutableListOf<String>()

    for (i in lines.indices) {
        val line = lines[i]
        result.add(line)

        if (line.startsWith("m=video") || line.startsWith("m=audio")) {
            val bitrateForSection = if (line.startsWith("m=video")) maxBitrateKbps else 128
            val nextLine = lines.getOrElse(i + 1) { "" }
            if (!nextLine.startsWith("b=")) {
                result.add("b=AS:$bitrateForSection")
            }
        }

        if (line.startsWith("a=fmtp:") && line.contains("minptime=") && !line.contains("stereo=1")) {
            result[result.size - 1] = line + ";stereo=1"
        }
    }

    return result.joinToString(lineEnding)
}

fun buildNvstSdp(params: NvstParams): String {
    val maxBitrate = maxOf(OFFICIAL_MIN_BITRATE_KBPS, params.maxBitrateKbps)
    val startupBitrate = maxOf(OFFICIAL_MIN_BITRATE_KBPS, Math.round(maxBitrate / 4.0).toInt())

    val lines = listOf(
        "v=0",
        "o=SdpTest test_id_13 14 IN IPv4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=general.icePassword:${params.credentials.pwd}",
        "a=general.iceUserNameFragment:${params.credentials.ufrag}",
        "a=general.dtlsFingerprint:${params.credentials.fingerprint}",
        "m=video 0 RTP/AVP",
        "a=msid:fbc-video-0",
        "a=vqos.fec.rateDropWindow:10",
        "a=vqos.fec.minRequiredFecPackets:2",
        "a=vqos.drc.minRequiredBitrateCheckEnabled:1",
        "a=vqos.fec.repairMinPercent:5",
        "a=vqos.fec.repairPercent:5",
        "a=vqos.fec.repairMaxPercent:35",
        "a=vqos.dynamicStreamingMode:3",
        "a=vqos.bllFec.enable:0",
        // 60fps profile: only drc.enable:1 (mode-3, non-high-fps).
        "a=vqos.drc.enable:1",
        "a=video.dx9EnableNv12:1",
        "a=video.dx9EnableHdr:1",
        "a=vqos.qpg.enable:1",
        "a=vqos.resControl.qp.qpg.featureSetting:7",
        "a=bwe.useOwdCongestionControl:1",
        "a=video.enableRtpNack:1",
        "a=vqos.bw.txRxLag.minFeedbackTxDeltaMs:200",
        "a=vqos.drc.bitrateIirFilterFactor:18",
        "a=video.packetSize:1140",
        "a=packetPacing.minNumPacketsPerGroup:15",
        "a=vqos.adjustStreamingFpsDuringOutOfFocus:1",
        "a=vqos.resControl.cpmRtc.ignoreOutOfFocusWindowState:1",
        "a=vqos.resControl.perfHistory.rtcIgnoreOutOfFocusWindowState:1",
        "a=vqos.resControl.cpmRtc.featureMask:3",
        "a=packetPacing.numGroups:5",
        "a=packetPacing.maxDelayUs:1000",
        "a=packetPacing.minNumPacketsFrame:10",
        "a=video.rtpNackQueueLength:1024",
        "a=video.rtpNackQueueMaxPackets:512",
        "a=video.rtpNackMaxPacketCount:25",
        "a=video.clientViewportWd:${params.width}",
        "a=video.clientViewportHt:${params.height}",
        "a=video.maxFPS:${params.fps}",
        "a=video.initialBitrateKbps:$startupBitrate",
        "a=video.initialPeakBitrateKbps:$startupBitrate",
        "a=vqos.bw.maximumBitrateKbps:$maxBitrate",
        "a=vqos.bw.minimumBitrateKbps:$OFFICIAL_MIN_BITRATE_KBPS",
        "a=video.maxNumReferenceFrames:4",
        "a=video.mapRtpTimestampsToFrames:1",
        "a=video.encoderCscMode:3",
        "a=video.encoderHdrCscMode:4",
        "a=video.dynamicRangeMode:0",
        "a=video.bitDepth:8",
        "a=video.scalingFeature1:0",
        "a=video.prefilterParams.prefilterMode:0",
        "a=video.prefilterParams.prefilterModel:0",
        "a=video.prefilterParams.denoiseLevel:0",
        "a=video.prefilterParams.sharpnessLevel:0",
        // Audio track (receive-only from server).
        "m=audio 0 RTP/AVP",
        "a=msid:audio",
        // Mic track (declared even though we do not send yet).
        "m=mic 0 RTP/AVP",
        "a=msid:mic",
        "a=rtpmap:0 PCMU/8000",
        // Input/application track.
        "m=application 0 RTP/AVP",
        "a=msid:input_1",
        "a=ri.partialReliableThresholdMs:${params.partialReliableThresholdMs}",
        "a=ri.hidDeviceMask:$HID_DEVICE_MASK_ALL",
        "a=ri.enablePartiallyReliableTransferGamepad:$PARTIALLY_RELIABLE_GAMEPAD_MASK_ALL",
        "a=ri.enablePartiallyReliableTransferHid:$HID_DEVICE_MASK_ALL",
        "",
    )

    return lines.joinToString("\n")
}

// ---- micSdp.ts ----

enum class SdpDirection(val wire: String) {
    SENDRECV("sendrecv"),
    SENDONLY("sendonly"),
    RECVONLY("recvonly"),
    INACTIVE("inactive"),
    NONE(""),
}

data class SdpMedia(
    // Position among the offer's m-lines, matching the transceiver order.
    val index: Int,
    val kind: String,
    var mid: String? = null,
    // The offerer's direction (NONE when the section declares none).
    var direction: SdpDirection = SdpDirection.NONE,
    val rtpmaps: MutableList<String> = mutableListOf(),
    val fmtps: MutableList<String> = mutableListOf(),
    var ptime: String? = null,
)

fun parseSdpMedia(sdp: String): List<SdpMedia> {
    val sections = mutableListOf<SdpMedia>()
    var current: SdpMedia? = null
    for (raw in sdp.split(Regex("\r?\n"))) {
        val line = raw.trim()
        if (line.startsWith("m=")) {
            current = SdpMedia(index = sections.size, kind = line.substring(2).split(" ")[0])
            sections.add(current)
            continue
        }
        val section = current ?: continue
        when {
            line.startsWith("a=mid:") -> section.mid = line.substring("a=mid:".length)
            line.startsWith("a=rtpmap:") -> section.rtpmaps.add(line.substring("a=rtpmap:".length))
            line.startsWith("a=fmtp:") -> section.fmtps.add(line.substring("a=fmtp:".length))
            line.startsWith("a=ptime:") -> section.ptime = line.substring("a=ptime:".length)
            else -> {
                val dir = SdpDirection.values().firstOrNull { it != SdpDirection.NONE && line == "a=${it.wire}" }
                if (dir != null) {
                    section.direction = dir
                }
            }
        }
    }
    return sections
}

// The audio section the server offers for receiving our microphone: a
// receive-only audio line, else the audio line OpenNOW found carrying it
// (mid "3") when the server leaves it inactive.
fun findMicSection(media: List<SdpMedia>): SdpMedia? {
    val audio = media.filter { it.kind == "audio" }
    return audio.firstOrNull { it.direction == SdpDirection.RECVONLY }
        ?: audio.firstOrNull { it.mid == "3" && it.direction == SdpDirection.INACTIVE }
}

// One line per m-section for the debug log: enough to see what the server
// offered for the microphone without dumping the whole SDP.
fun describeMedia(media: List<SdpMedia>): String =
    media.joinToString("\n") { m ->
        val base = "#${m.index} ${m.kind} mid=${m.mid} dir=${if (m.direction == SdpDirection.NONE) "-" else m.direction.wire}" +
            " ptime=${m.ptime ?: "-"} [${m.rtpmaps.joinToString(" | ")}]"
        if (m.fmtps.isNotEmpty()) base + " fmtp[${m.fmtps.joinToString(" | ")}]" else base
    }
