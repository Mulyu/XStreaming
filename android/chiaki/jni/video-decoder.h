// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL

#ifndef CHIAKI_JNI_VIDEO_DECODER_H
#define CHIAKI_JNI_VIDEO_DECODER_H

#include <jni.h>

#include <chiaki/thread.h>
#include <chiaki/log.h>

typedef struct AMediaCodec AMediaCodec;
typedef struct ANativeWindow ANativeWindow;

typedef struct android_chiaki_video_decoder_t
{
	ChiakiLog *log;
	ChiakiMutex codec_mutex;
	AMediaCodec *codec;
	ANativeWindow *window;
	uint64_t timestamp_cur;
	ChiakiThread output_thread;
	bool shutdown_output;
	int32_t target_width;
	int32_t target_height;
	ChiakiCodec target_codec;
	// Set by kill_decoder() (surface torn down, e.g. the app backgrounded) so
	// the *next* decoder created from scratch (set_surface()'s "no existing
	// codec" branch -- never the live AMediaCodec_setOutputSurface() hot-swap
	// just above it) knows it has no prior reference-frame state. A fresh
	// AMediaCodec can't decode a P/B-frame referencing frames it never saw,
	// so android_chiaki_video_decoder_video_sample() discards exactly one
	// sample and reports failure instead of queuing it -- see its own
	// comment and chiaki/session.h's video_sample_cb doc ("On false, a
	// corrupt frame will be reported to get a new keyframe"), which is the
	// existing, already-wired mechanism this reuses to make the PS5 resync
	// with a fresh keyframe. On its own this is still not enough -- see
	// set_surface()'s own header_buf/header_buf_size parameters for the
	// other half (the fresh AMediaCodec has no CSD at all until those are
	// fed to it, so even a successful resync has nothing to decode with).
	bool needs_keyframe;
	// Gates the "Received video data, but decoder is not initialized!" log in
	// android_chiaki_video_decoder_video_sample() to once per offline period
	// instead of once per frame -- the receiver thread keeps feeding frames
	// the whole time the app is backgrounded (no surface/codec), which could
	// otherwise be thousands of log lines for a multi-minute background.
	bool logged_no_codec;
	// Logs the first few AMediaCodec_dequeueOutputBuffer() successes after
	// each decoder (re)creation, then goes quiet (see .c file). The per-
	// sample logs above only prove the codec is accepting *input* after a
	// resume; this is the only way to tell from a log capture alone whether
	// it's actually producing decoded *output* frames too, or silently
	// stuck -- which would mean the problem is downstream (the Surface/
	// window it's rendering to), not in decode itself.
	int32_t output_frames_since_reset;
} AndroidChiakiVideoDecoder;

ChiakiErrorCode android_chiaki_video_decoder_init(AndroidChiakiVideoDecoder *decoder, ChiakiLog *log, int32_t target_width, int32_t target_height, ChiakiCodec codec);
void android_chiaki_video_decoder_fini(AndroidChiakiVideoDecoder *decoder);
// header_buf/header_buf_size: the current profile's codec header (SPS/PPS/VPS
// -- see chiaki_video_receiver_current_header()), fed into a BRAND NEW decoder
// right after it's created (atomically, before any concurrent
// android_chiaki_video_decoder_video_sample() call can queue a real frame
// first -- see the .c file's own comment on this). Ignored otherwise (the
// null-surface/teardown path, and the existing-codec surface-hot-swap path,
// where the original CSD the codec already has is still valid). May be
// NULL/0 if the caller has no header yet (e.g. the very first ever
// set_surface() call, before any video has streamed at all).
void android_chiaki_video_decoder_set_surface(AndroidChiakiVideoDecoder *decoder, JNIEnv *env, jobject surface, const uint8_t *header_buf, size_t header_buf_size);
bool android_chiaki_video_decoder_video_sample(uint8_t *buf, size_t buf_size, int32_t frames_lost, bool frame_recovered, void *user);

#endif
