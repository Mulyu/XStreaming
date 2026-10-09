// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL

#include "video-decoder.h"

#include <jni.h>

#include <media/NdkMediaCodec.h>
#include <media/NdkMediaFormat.h>
#include <android/native_window_jni.h>

#include <string.h>

#define INPUT_BUFFER_TIMEOUT_MS 10
// A bounded poll instead of an infinite wait, so the output thread always
// wakes up on its own to notice decoder->shutdown_output -- see kill_decoder()
// and the output thread loop below. AMediaCodec_stop() is not documented (and
// not reliable in practice on every Android version) to actually unblock a
// concurrent AMediaCodec_dequeueOutputBuffer() call already parked with an
// infinite timeout, which previously made kill_decoder()'s chiaki_thread_join()
// of this thread a potential permanent hang -- exactly the same hazard class
// already fixed for the surface-teardown path, but reachable here any time the
// PS5 simply stops sending frames (e.g. the streamed game itself ends) and
// something later calls android_chiaki_video_decoder_fini(). A short timeout
// costs nothing while frames are actively arriving -- dequeueOutputBuffer()
// still returns immediately the instant a buffer is ready either way -- and
// only matters during genuine idle periods.
#define OUTPUT_BUFFER_TIMEOUT_MS 100

static void *android_chiaki_video_decoder_output_thread_func(void *user);

// Shared by android_chiaki_video_decoder_video_sample() (real frame data) and
// android_chiaki_video_decoder_set_surface()'s fresh-decoder path (replaying
// the cached codec header -- see its header_buf parameter) -- both already
// hold decoder->codec_mutex and have confirmed decoder->codec is non-NULL
// before calling this.
static bool queue_samples_locked(AndroidChiakiVideoDecoder *decoder, const uint8_t *buf, size_t buf_size)
{
	bool r = true;
	while(buf_size > 0)
	{
		ssize_t codec_buf_index = -1;
		for(int attempt = 0; attempt < 3; attempt++)
		{
			codec_buf_index = AMediaCodec_dequeueInputBuffer(decoder->codec, INPUT_BUFFER_TIMEOUT_MS * 1000);
			if(codec_buf_index >= 0)
				break;
		}
		if(codec_buf_index < 0)
		{
			CHIAKI_LOGE(decoder->log, "Failed to get input buffer");
			r = false;
			break;
		}

		size_t codec_buf_size;
		uint8_t *codec_buf = AMediaCodec_getInputBuffer(decoder->codec, (size_t)codec_buf_index, &codec_buf_size);
		size_t codec_sample_size = buf_size;
		if(codec_sample_size > codec_buf_size)
		{
			//CHIAKI_LOGD(decoder->log, "Sample is bigger than buffer, splitting");
			codec_sample_size = codec_buf_size;
		}
		memcpy(codec_buf, buf, codec_sample_size);
		media_status_t status = AMediaCodec_queueInputBuffer(decoder->codec, (size_t)codec_buf_index, 0, codec_sample_size, decoder->timestamp_cur++, 0); // timestamp just raised by 1 for maximum realtime
		if(status != AMEDIA_OK)
		{
			CHIAKI_LOGE(decoder->log, "AMediaCodec_queueInputBuffer() failed: %d", (int)status);
		}
		buf += codec_sample_size;
		buf_size -= codec_sample_size;
	}
	return r;
}

ChiakiErrorCode android_chiaki_video_decoder_init(AndroidChiakiVideoDecoder *decoder, ChiakiLog *log, int32_t target_width, int32_t target_height, ChiakiCodec codec)
{
	decoder->log = log;
	decoder->codec = NULL;
	decoder->timestamp_cur = 0;
	decoder->target_width = target_width;
	decoder->target_height = target_height;
	decoder->target_codec = codec;
	decoder->shutdown_output = false;
	decoder->needs_keyframe = false;
	decoder->logged_no_codec = false;
	return chiaki_mutex_init(&decoder->codec_mutex, false);
}

static void kill_decoder(AndroidChiakiVideoDecoder *decoder)
{
	chiaki_mutex_lock(&decoder->codec_mutex);
	decoder->shutdown_output = true;
	// 1000ms, not 1000us (see the *1000 ms->us convention used everywhere else in this
	// file) -- too short here made the codec_buf_index<0 branch below common, which skips
	// chiaki_thread_join() and deletes decoder->codec while the output thread could still
	// be mid-call on it.
	ssize_t codec_buf_index = AMediaCodec_dequeueInputBuffer(decoder->codec, 1000 * 1000);
	if(codec_buf_index >= 0)
	{
		CHIAKI_LOGI(decoder->log, "Video Decoder sending EOS buffer");
		AMediaCodec_queueInputBuffer(decoder->codec, (size_t)codec_buf_index, 0, 0, decoder->timestamp_cur++, AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM);
		AMediaCodec_stop(decoder->codec);
		chiaki_mutex_unlock(&decoder->codec_mutex);
		chiaki_thread_join(&decoder->output_thread, NULL);
	}
	else
	{
		CHIAKI_LOGE(decoder->log, "Failed to get input buffer for shutting down Video Decoder!");
		AMediaCodec_stop(decoder->codec);
		chiaki_mutex_unlock(&decoder->codec_mutex);
	}
	AMediaCodec_delete(decoder->codec);
	decoder->codec = NULL;
	decoder->shutdown_output = false;
	// The next decoder set_surface() creates from scratch starts with no
	// reference-frame history -- see this flag's own comment in the header.
	decoder->needs_keyframe = true;
	// Starting a fresh offline period -- let the next "no codec" drop log once.
	decoder->logged_no_codec = false;
}

void android_chiaki_video_decoder_fini(AndroidChiakiVideoDecoder *decoder)
{
	if(decoder->codec)
		kill_decoder(decoder);
	chiaki_mutex_fini(&decoder->codec_mutex);
}

void android_chiaki_video_decoder_set_surface(AndroidChiakiVideoDecoder *decoder, JNIEnv *env, jobject surface, const uint8_t *header_buf, size_t header_buf_size)
{
	// One unambiguous log line for which of the three branches below actually
	// runs -- teardown / hot-swap-existing-codec / fresh-create -- since
	// distinguishing exactly that was the open question in prior black-screen
	// investigations of this surface-lifecycle path.
	CHIAKI_LOGI(decoder->log, "set_surface() called, surface=%s, has_codec=%d", surface ? "present" : "null", decoder->codec != NULL);

	if(!surface)
	{
		// kill_decoder() locks codec_mutex itself (see android_chiaki_video_decoder_fini(),
		// which calls it the same way) -- pre-locking here before calling it deadlocked
		// this exact thread every time the surface was torn down mid-stream (e.g. the
		// SurfaceView's surfaceDestroyed(), called synchronously on the UI thread), which
		// is what made the whole PS Plus stream freeze solid.
		chiaki_mutex_lock(&decoder->codec_mutex);
		bool has_codec = decoder->codec != NULL;
		chiaki_mutex_unlock(&decoder->codec_mutex);
		if(has_codec)
		{
			kill_decoder(decoder);
			CHIAKI_LOGI(decoder->log, "Decoder shut down after surface was removed");
		}
		return;
	}

	chiaki_mutex_lock(&decoder->codec_mutex);

	if(decoder->codec)
	{
#if __ANDROID_API__ >= 23
		CHIAKI_LOGI(decoder->log, "Video decoder already initialized, swapping surface");
		ANativeWindow *new_window = surface ? ANativeWindow_fromSurface(env, surface) : NULL;
		AMediaCodec_setOutputSurface(decoder->codec, new_window);
		ANativeWindow_release(decoder->window);
		decoder->window = new_window;
#else
		CHIAKI_LOGE(decoder->log, "Video Decoder already initialized");
#endif
		goto beach;
	}

	decoder->window = ANativeWindow_fromSurface(env, surface);
	if(!decoder->window)
	{
		CHIAKI_LOGE(decoder->log, "ANativeWindow_fromSurface() returned NULL");
		goto beach;
	}

	const char *mime = chiaki_codec_is_h265(decoder->target_codec) ? "video/hevc" : "video/avc";
	CHIAKI_LOGI(decoder->log, "Initializing decoder with mime %s", mime);

	decoder->codec = AMediaCodec_createDecoderByType(mime);
	if(!decoder->codec)
	{
		CHIAKI_LOGE(decoder->log, "Failed to create AMediaCodec for mime type %s", mime);
		goto error_surface;
	}

	AMediaFormat *format = AMediaFormat_new();
	AMediaFormat_setString(format, AMEDIAFORMAT_KEY_MIME, mime);
	AMediaFormat_setInt32(format, AMEDIAFORMAT_KEY_WIDTH, decoder->target_width);
	AMediaFormat_setInt32(format, AMEDIAFORMAT_KEY_HEIGHT, decoder->target_height);

	media_status_t r = AMediaCodec_configure(decoder->codec, format, decoder->window, NULL, 0);
	if(r != AMEDIA_OK)
	{
		CHIAKI_LOGE(decoder->log, "AMediaCodec_configure() failed: %d", (int)r);
		AMediaFormat_delete(format);
		goto error_codec;
	}

	r = AMediaCodec_start(decoder->codec);
	AMediaFormat_delete(format);
	if(r != AMEDIA_OK)
	{
		CHIAKI_LOGE(decoder->log, "AMediaCodec_start() failed: %d", (int)r);
		goto error_codec;
	}

	ChiakiErrorCode err = chiaki_thread_create(&decoder->output_thread, android_chiaki_video_decoder_output_thread_func, decoder);
	if(err != CHIAKI_ERR_SUCCESS)
	{
		CHIAKI_LOGE(decoder->log, "Failed to create output thread for AMediaCodec");
		goto error_codec;
	}

	// This decoder was just configured with no CSD at all (AMediaFormat above
	// only ever sets MIME/width/height) -- the only place SPS/PPS/VPS data
	// exists for this client is the caller-provided header_buf (see this
	// function's own doc comment in video-decoder.h). Feed it now, still
	// holding codec_mutex, so this is strictly ordered before any concurrent
	// android_chiaki_video_decoder_video_sample() call can queue a real frame
	// into this same fresh codec first.
	if(header_buf && header_buf_size > 0)
	{
		CHIAKI_LOGI(decoder->log, "Feeding cached codec header (%zu bytes) into freshly created decoder", header_buf_size);
		queue_samples_locked(decoder, header_buf, header_buf_size);
	}

	goto beach;

error_codec:
	AMediaCodec_delete(decoder->codec);
	decoder->codec = NULL;

error_surface:
	ANativeWindow_release(decoder->window);
	decoder->window = NULL;

beach:
	chiaki_mutex_unlock(&decoder->codec_mutex);
}

bool android_chiaki_video_decoder_video_sample(uint8_t *buf, size_t buf_size, int32_t frames_lost, bool frame_recovered, void *user)
{
	bool r = true;
	AndroidChiakiVideoDecoder *decoder = user;
	// Ignore frames_lost and frame_recovered parameters for now - Android decoder handles frame loss internally
	(void)frames_lost;
	(void)frame_recovered;

	chiaki_mutex_lock(&decoder->codec_mutex);

	if(!decoder->codec)
	{
		if(!decoder->logged_no_codec)
		{
			CHIAKI_LOGI(decoder->log, "Dropping video data while decoder is uninitialized (e.g. backgrounded) -- will request a fresh keyframe once it's recreated");
			decoder->logged_no_codec = true;
		}
		// Report *success* here, not failure. This is reached for every frame
		// the receiver thread keeps getting fed for as long as the app stays
		// backgrounded (the connection and chiaki's own video receiver keep
		// running normally the whole time -- only the local AMediaCodec is
		// gone) -- that can be thousands of frames for a multi-minute
		// backgrounding. Previously this returned `false` ("corrupt frame"),
		// which chiaki_video_receiver_av_packet()'s missing-frame check
		// (videoreceiver.c) turns into a stream_connection_send_corrupt_frame()
		// report on every single subsequent frame, each with an ever-growing
		// range back to the moment the app was backgrounded (frame_index_
		// prev_complete never advances while every callback fails) -- i.e. a
		// continuous, growing-range "corrupt frame" flood sent to the PS5 for
		// the entire backgrounded duration, not the one-shot signal this
		// mechanism is meant to be. That flood is the most likely reason the
		// PS5 never cleanly resynced even after the needs_keyframe/header-
		// replay fixes below landed: by the time they ran, the corrupt-frame
		// bookkeeping was already far out of sync. Returning success instead
		// keeps frame_index_prev_complete advancing normally (no report at
		// all while intentionally not decoding -- there's nothing corrupt
		// about a frame we chose not to decode), so when the decoder comes
		// back, needs_keyframe below fires exactly once, for a small, sane,
		// current frame range.
		r = true;
		goto beach;
	}

	if(decoder->needs_keyframe)
	{
		// This decoder was just (re-)created from scratch (e.g. after the app
		// backgrounded and foregrounded again) and has no reference-frame
		// history, so this sample -- almost certainly a P/B-frame the PS5 sent
		// assuming decode continuity -- can't be decoded correctly. Discard it
		// and report failure instead of queuing it: see video-decoder.h's own
		// comment on this flag for why that's enough to make chiaki-lib
		// request a fresh keyframe from the PS5 on its own.
		decoder->needs_keyframe = false;
		CHIAKI_LOGI(decoder->log, "Discarding first sample after decoder restart, requesting keyframe");
		r = false;
		goto beach;
	}

	r = queue_samples_locked(decoder, buf, buf_size);

beach:
	chiaki_mutex_unlock(&decoder->codec_mutex);
	return r;
}

static void *android_chiaki_video_decoder_output_thread_func(void *user)
{
	AndroidChiakiVideoDecoder *decoder = user;

	while(1)
	{
		AMediaCodecBufferInfo info;
		ssize_t status = AMediaCodec_dequeueOutputBuffer(decoder->codec, &info, OUTPUT_BUFFER_TIMEOUT_MS * 1000);
		if(status >= 0)
		{
			AMediaCodec_releaseOutputBuffer(decoder->codec, (size_t)status, info.size != 0);
			if(info.flags & AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM)
			{
				CHIAKI_LOGI(decoder->log, "AMediaCodec reported EOS");
				break;
			}
		}
		else
		{
			chiaki_mutex_lock(&decoder->codec_mutex);
			bool shutdown = decoder->shutdown_output;
			chiaki_mutex_unlock(&decoder->codec_mutex);
			if(shutdown)
			{
				CHIAKI_LOGI(decoder->log, "Video Decoder Output Thread detected shutdown after reported error");
				break;
			}
		}
	}

	CHIAKI_LOGI(decoder->log, "Video Decoder Output Thread exiting");

	return NULL;
}
