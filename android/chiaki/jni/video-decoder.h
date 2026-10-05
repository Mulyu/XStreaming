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
	// with a fresh keyframe, rather than leaving the picture black forever
	// waiting for a keyframe that was never requested.
	bool needs_keyframe;
} AndroidChiakiVideoDecoder;

ChiakiErrorCode android_chiaki_video_decoder_init(AndroidChiakiVideoDecoder *decoder, ChiakiLog *log, int32_t target_width, int32_t target_height, ChiakiCodec codec);
void android_chiaki_video_decoder_fini(AndroidChiakiVideoDecoder *decoder);
void android_chiaki_video_decoder_set_surface(AndroidChiakiVideoDecoder *decoder, JNIEnv *env, jobject surface);
bool android_chiaki_video_decoder_video_sample(uint8_t *buf, size_t buf_size, int32_t frames_lost, bool frame_recovered, void *user);

#endif
