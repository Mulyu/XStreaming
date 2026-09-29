// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL

#ifndef CHIAKI_JNI_VIDEO_DECODER_H
#define CHIAKI_JNI_VIDEO_DECODER_H

#include <jni.h>
#include <stdatomic.h>

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
	// TEMPORARY debug counters for the black-screen investigation -- see
	// android_chiaki_video_decoder_get_debug_counts. Network-level metrics
	// (ChiakiStreamConnection's measured_fps etc., exposed separately via
	// sessionGetMetrics) only prove compressed video is arriving; these
	// prove whether it's actually reaching AMediaCodec and coming back out
	// as real (non-empty) output buffers released to the Surface.
	atomic_int debug_samples_in;      // android_chiaki_video_decoder_video_sample calls
	atomic_int debug_buffers_out;     // AMediaCodec_dequeueOutputBuffer successes
	atomic_int debug_buffers_rendered; // ...of those, released with render=true (info.size != 0)
	atomic_int debug_configure_failed; // AMediaCodec_configure/_start failed at least once
} AndroidChiakiVideoDecoder;

ChiakiErrorCode android_chiaki_video_decoder_init(AndroidChiakiVideoDecoder *decoder, ChiakiLog *log, int32_t target_width, int32_t target_height, ChiakiCodec codec);
void android_chiaki_video_decoder_fini(AndroidChiakiVideoDecoder *decoder);
void android_chiaki_video_decoder_set_surface(AndroidChiakiVideoDecoder *decoder, JNIEnv *env, jobject surface);
bool android_chiaki_video_decoder_video_sample(uint8_t *buf, size_t buf_size, int32_t frames_lost, bool frame_recovered, void *user);
// out[0]=samples_in, out[1]=buffers_out, out[2]=buffers_rendered, out[3]=configure_failed (0/1).
void android_chiaki_video_decoder_get_debug_counts(AndroidChiakiVideoDecoder *decoder, int out[4]);

#endif