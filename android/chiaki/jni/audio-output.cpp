// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL

#include "audio-output.h"

#include "circular-buf.hpp"

#include <chiaki/log.h>
#include <chiaki/thread.h>

#include <oboe/Oboe.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <mutex>
#include <thread>

#define BUFFER_CHUNK_SIZE 1024
#define BUFFER_CHUNKS_COUNT 32

// Connect-time open/start is otherwise one-shot: a transient failure (seen
// in practice on Google TV, plausibly HDMI/ARC renegotiation or audio-focus
// churn around session connect) left the stream permanently silent for the
// rest of that session with nothing ever retrying it.
#define AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS 5
#define AUDIO_OUTPUT_OPEN_RETRY_DELAY_MS 200

using AudioBuffer = CircularBuffer<BUFFER_CHUNKS_COUNT, BUFFER_CHUNK_SIZE>;

class AudioOutput;

class AudioOutputCallback: public oboe::AudioStreamCallback
{
private:
	AudioOutput *audio_output;

public:
	AudioOutputCallback(AudioOutput *audio_output) : audio_output(audio_output) {}
	oboe::DataCallbackResult onAudioReady(oboe::AudioStream *stream, void *audioData, int32_t numFrames) override;
	void onErrorBeforeClose(oboe::AudioStream *stream, oboe::Result error) override;
	void onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) override;
};

struct AudioOutput
{
	ChiakiLog *log;
	oboe::ManagedStream stream;
	AudioOutputCallback stream_callback;
	AudioBuffer buf;
	std::atomic<float> gain { 1.0f };

	// Remembered from the audio header so the stream can be rebuilt
	// identically after the output device changes (see onErrorAfterClose).
	uint32_t channels = 0;
	uint32_t rate = 0;

	// Guards (re)creating `stream` against free(): reopening happens on
	// Oboe's own error thread, which can run at the same time as a session
	// teardown. shutting_down is only touched under the lock.
	std::mutex stream_mutex;
	bool shutting_down = false;

	AudioOutput() : stream_callback(this) {}
};

extern "C" void *android_chiaki_audio_output_new(ChiakiLog *log)
{
	auto r = new AudioOutput();
	r->log = log;
	return r;
}

extern "C" void android_chiaki_audio_output_free(void *audio_output)
{
	if(!audio_output)
		return;
	auto ao = reinterpret_cast<AudioOutput *>(audio_output);
	{
		std::lock_guard<std::mutex> lock(ao->stream_mutex);
		ao->shutting_down = true;
		ao->stream = nullptr;
	}
	delete ao;
}

// Opens and starts ao->stream from the remembered channels/rate, retrying a
// few times. The caller must hold ao->stream_mutex.
static bool android_chiaki_audio_output_open_stream(AudioOutput *ao)
{
	for(int attempt = 1; attempt <= AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS; attempt++)
	{
		oboe::AudioStreamBuilder builder;
		builder.setPerformanceMode(oboe::PerformanceMode::LowLatency)
			->setSharingMode(oboe::SharingMode::Exclusive)
			->setFormat(oboe::AudioFormat::I16)
			->setChannelCount(ao->channels)
			->setSampleRate(ao->rate)
			->setCallback(&ao->stream_callback);

		auto result = builder.openManagedStream(ao->stream);
		if(result != oboe::Result::OK)
		{
			CHIAKI_LOGE(ao->log, "Audio Output failed to open Oboe stream (attempt %d/%d): %s",
					attempt, AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS, oboe::convertToText(result));
			if(attempt < AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS)
				std::this_thread::sleep_for(std::chrono::milliseconds(AUDIO_OUTPUT_OPEN_RETRY_DELAY_MS));
			continue;
		}
		CHIAKI_LOGI(ao->log, "Audio Output opened Oboe stream (attempt %d/%d)", attempt, AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS);

		result = ao->stream->start();
		if(result == oboe::Result::OK)
		{
			CHIAKI_LOGI(ao->log, "Audio Output started Oboe stream");
			return true;
		}

		CHIAKI_LOGE(ao->log, "Audio Output failed to start Oboe stream (attempt %d/%d): %s",
				attempt, AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS, oboe::convertToText(result));
		ao->stream->close();
		ao->stream = nullptr;
		if(attempt < AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS)
			std::this_thread::sleep_for(std::chrono::milliseconds(AUDIO_OUTPUT_OPEN_RETRY_DELAY_MS));
	}

	CHIAKI_LOGE(ao->log, "Audio Output giving up on opening/starting Oboe stream after %d attempts", AUDIO_OUTPUT_OPEN_MAX_ATTEMPTS);
	return false;
}

extern "C" void android_chiaki_audio_output_settings(uint32_t channels, uint32_t rate, void *audio_output)
{
	auto ao = reinterpret_cast<AudioOutput *>(audio_output);

	std::lock_guard<std::mutex> lock(ao->stream_mutex);
	ao->channels = channels;
	ao->rate = rate;
	android_chiaki_audio_output_open_stream(ao);
}

extern "C" void android_chiaki_audio_output_frame(int16_t *buf, size_t samples_count, void *audio_output)
{
	auto ao = reinterpret_cast<AudioOutput *>(audio_output);

	size_t buf_size = samples_count * sizeof(int16_t);
	size_t pushed = ao->buf.Push(reinterpret_cast<uint8_t *>(buf), buf_size);
	if(pushed < buf_size)
		CHIAKI_LOGW(ao->log, "Audio Output Buffer Overflow!");
}

extern "C" void android_chiaki_audio_output_set_gain(float gain, void *audio_output)
{
	if(!audio_output)
		return;
	auto ao = reinterpret_cast<AudioOutput *>(audio_output);
	ao->gain.store(std::max(0.0f, std::min(1.0f, gain)), std::memory_order_relaxed);
}

oboe::DataCallbackResult AudioOutputCallback::onAudioReady(oboe::AudioStream *stream, void *audio_data, int32_t num_frames)
{
	if(stream->getFormat() != oboe::AudioFormat::I16)
	{
		CHIAKI_LOGE(audio_output->log, "Oboe stream has invalid format in callback");
		return oboe::DataCallbackResult::Stop;
	}

	int32_t bytes_per_frame = stream->getBytesPerFrame();
	size_t buf_size_requested = static_cast<size_t>(bytes_per_frame * num_frames);
	auto buf = reinterpret_cast<uint8_t *>(audio_data);

	size_t buf_size_delivered = audio_output->buf.Pop(buf, buf_size_requested);
	//CHIAKI_LOGW(audio_output->log, "Delivered %llu", (unsigned long long)buf_size_delivered);

	if(buf_size_delivered < buf_size_requested)
	{
		CHIAKI_LOGV(audio_output->log, "Audio Output Buffer Underflow!");
		memset(buf + buf_size_delivered, 0, buf_size_requested - buf_size_delivered);
	}

	// Applied here (not at push time in android_chiaki_audio_output_frame)
	// so a live gain change takes effect on the very next output callback
	// instead of only on samples pushed after the change -- this buffer
	// typically holds a fraction of a second already queued ahead of Oboe.
	float gain = audio_output->gain.load(std::memory_order_relaxed);
	if(gain != 1.0f)
	{
		auto samples = reinterpret_cast<int16_t *>(buf);
		size_t sample_count = buf_size_delivered / sizeof(int16_t);
		for(size_t i = 0; i < sample_count; i++)
		{
			float scaled = static_cast<float>(samples[i]) * gain;
			scaled = std::max(-32768.0f, std::min(32767.0f, scaled));
			samples[i] = static_cast<int16_t>(scaled);
		}
	}

	return oboe::DataCallbackResult::Continue;
}

void AudioOutputCallback::onErrorBeforeClose(oboe::AudioStream *stream, oboe::Result error)
{
	CHIAKI_LOGE(audio_output->log, "Oboe reported error before close: %s", oboe::convertToText(error));
}

void AudioOutputCallback::onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error)
{
	CHIAKI_LOGE(audio_output->log, "Oboe reported error after close: %s", oboe::convertToText(error));

	// The output device went away -- switching to/from Bluetooth, plugging in
	// headphones or HDMI, etc. Oboe has already stopped and closed the dead
	// stream and won't open a new one by itself, so without this the session
	// stayed silent for good. Opening a fresh stream picks up whichever device
	// is the default now. This runs on Oboe's own error thread, where Oboe
	// documents that the old stream may be deleted, which is exactly what
	// replacing ao->stream does.
	if(error != oboe::Result::ErrorDisconnected)
		return;
	std::lock_guard<std::mutex> lock(audio_output->stream_mutex);
	if(audio_output->shutting_down)
		return;
	CHIAKI_LOGI(audio_output->log, "Audio Output device disconnected, reopening Oboe stream");
	android_chiaki_audio_output_open_stream(audio_output);
}
