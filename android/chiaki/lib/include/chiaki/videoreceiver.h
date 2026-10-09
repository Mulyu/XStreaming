// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL

#ifndef CHIAKI_VIDEORECEIVER_H
#define CHIAKI_VIDEORECEIVER_H

#include "common.h"
#include "log.h"
#include "video.h"
#include "takion.h"
#include "frameprocessor.h"
#include "bitstream.h"
#include "thread.h"

#ifdef __cplusplus
extern "C" {
#endif

#define CHIAKI_VIDEO_PROFILES_MAX 8

typedef struct chiaki_video_receiver_t
{
	struct chiaki_session_t *session;
	ChiakiLog *log;
	ChiakiVideoProfile profiles[CHIAKI_VIDEO_PROFILES_MAX];
	size_t profiles_count;
	int profile_cur; // < 1 if no profile selected yet, else index in profiles
	// Guards profile_cur only (profiles[]/profiles_count are written once at
	// chiaki_video_receiver_stream_info() time and never mutated again, so
	// they need no lock to read). Without this, chiaki_video_receiver_
	// current_header() -- called from the Android UI thread via
	// sessionSetSurface() whenever the app resumes from background -- could
	// race chiaki_video_receiver_av_packet() (receiver thread) rewriting
	// profile_cur on an adaptive-stream profile switch, and hand back a torn
	// index / the wrong profile's header right at the moment that matters most.
	ChiakiMutex profile_mutex;

	int32_t frame_index_cur; // frame that is currently being filled
	int32_t frame_index_prev; // last frame that has been at least partially decoded
	int32_t frame_index_prev_complete; // last frame that has been completely decoded
	ChiakiFrameProcessor frame_processor;
	ChiakiPacketStats *packet_stats;

	int32_t frames_lost;
	uint64_t cumulative_frames_lost; // running total for the stats overlay (never reset mid-session)
	int32_t reference_frames[16];
	ChiakiBitstream bitstream;
} ChiakiVideoReceiver;

CHIAKI_EXPORT void chiaki_video_receiver_init(ChiakiVideoReceiver *video_receiver, struct chiaki_session_t *session, ChiakiPacketStats *packet_stats);
CHIAKI_EXPORT void chiaki_video_receiver_fini(ChiakiVideoReceiver *video_receiver);

/**
 * Called after receiving the Stream Info Packet.
 *
 * @param video_receiver
 * @param profiles Array of profiles. Ownership of the contained header buffers will be transferred to the ChiakiVideoReceiver!
 * @param profiles_count must be <= CHIAKI_VIDEO_PROFILES_MAX
 */
CHIAKI_EXPORT void chiaki_video_receiver_stream_info(ChiakiVideoReceiver *video_receiver, ChiakiVideoProfile *profiles, size_t profiles_count);

CHIAKI_EXPORT void chiaki_video_receiver_av_packet(ChiakiVideoReceiver *video_receiver, ChiakiTakionAVPacket *packet);

/**
 * Returns the current profile's codec header (SPS/PPS/VPS), the same bytes
 * originally pushed to video_sample_cb exactly once at chiaki_video_receiver_stream_info()
 * time (or on an actual adaptive-stream profile switch -- see chiaki_video_receiver_av_packet()).
 * A client-side video sink that gets torn down and recreated independently of the session
 * (e.g. Android's own AndroidChiakiVideoDecoder across a backgrounded app, where the whole
 * AMediaCodec instance -- and the CSD it was configured with -- is destroyed and later rebuilt
 * from scratch) has no other way to learn these bytes again: ordinary mid-stream frames never
 * carry them inline (see chiaki_bitstream_slice(), which only ever expects slice NAL units).
 * Call this and feed the result into the sink yourself immediately after recreating it; no
 * callback is invoked here, so this is safe even if the sink can't currently distinguish a
 * header buffer from a frame buffer, and does not need to go through whatever gating/recovery
 * state (e.g. "the next frame is being discarded to request a fresh keyframe") the sink layers
 * on top of video_sample_cb -- a header is config, not a frame, so it shouldn't be subject to it.
 *
 * @param header_sz_out set to the header's size, or 0 if there is no current profile yet
 * @return pointer to the header bytes (owned by video_receiver, valid for the life of the
 *         session), or NULL if no profile has been selected yet
 */
CHIAKI_EXPORT const uint8_t *chiaki_video_receiver_current_header(ChiakiVideoReceiver *video_receiver, size_t *header_sz_out);

static inline ChiakiVideoReceiver *chiaki_video_receiver_new(struct chiaki_session_t *session, ChiakiPacketStats *packet_stats)
{
	ChiakiVideoReceiver *video_receiver = CHIAKI_NEW(ChiakiVideoReceiver);
	if(!video_receiver)
		return NULL;
	chiaki_video_receiver_init(video_receiver, session, packet_stats);
	return video_receiver;
}

static inline void chiaki_video_receiver_free(ChiakiVideoReceiver *video_receiver)
{
	if(!video_receiver)
		return;
	chiaki_video_receiver_fini(video_receiver);
	free(video_receiver);
}

#ifdef __cplusplus
}
#endif

#endif // CHIAKI_VIDEORECEIVER_H
