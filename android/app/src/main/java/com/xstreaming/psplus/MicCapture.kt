package com.xstreaming.psplus

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log

/**
 * Microphone capture for the PS Plus cloud session: 48 kHz mono PCM16 read in
 * 10 ms (480-sample) blocks, duplicated to stereo, and handed to [sink] one
 * 960-short frame at a time (the libchiaki Opus encoder takes stereo frames).
 *
 * start() returns false (never throws) when the record permission is missing
 * or the device refuses the format. stop() joins the capture thread, so it is
 * safe to free the native session right after it returns.
 */
class MicCapture(private val sink: (ShortArray) -> Boolean)
{
	private companion object
	{
		const val TAG = "PsPlusMic"
		const val RATE = 48000
		const val FRAME = 480
	}

	@Volatile
	private var running = false
	private var thread: Thread? = null
	private var record: AudioRecord? = null

	@Synchronized
	@SuppressLint("MissingPermission")
	fun start(): Boolean
	{
		if(running)
			return true
		val minSize = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
		if(minSize <= 0)
		{
			Log.w(TAG, "48 kHz mono capture is not supported (min buffer $minSize)")
			return false
		}
		val bufferBytes = maxOf(minSize, FRAME * 2 * 4)
		val rec = try
		{
			// VOICE_COMMUNICATION enables the platform echo canceller, which
			// matters because the game audio plays from the same device.
			AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, RATE,
				AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferBytes)
		}
		catch(e: Exception)
		{
			Log.w(TAG, "AudioRecord failed to construct", e)
			return false
		}
		if(rec.state != AudioRecord.STATE_INITIALIZED)
		{
			Log.w(TAG, "AudioRecord not initialized (record permission missing?)")
			rec.release()
			return false
		}
		try
		{
			rec.startRecording()
		}
		catch(e: Exception)
		{
			Log.w(TAG, "startRecording failed", e)
			rec.release()
			return false
		}
		record = rec
		running = true
		thread = Thread({ loop(rec) }, "ps-mic").also {
			it.isDaemon = true
			it.start()
		}
		Log.i(TAG, "capturing")
		return true
	}

	private fun loop(rec: AudioRecord)
	{
		val mono = ShortArray(FRAME)
		val stereo = ShortArray(FRAME * 2)
		var frames = 0
		var accepted = 0
		while(running)
		{
			var got = 0
			while(running && got < FRAME)
			{
				val n = rec.read(mono, got, FRAME - got)
				if(n <= 0)
				{
					Log.w(TAG, "read returned $n, stopping capture")
					running = false
					break
				}
				got += n
			}
			if(got < FRAME)
				break
			for(i in 0 until FRAME)
			{
				stereo[2 * i] = mono[i]
				stereo[2 * i + 1] = mono[i]
			}
			frames++
			if(sink(stereo))
				accepted++
			if(frames == 500)
				Log.i(TAG, "first 5 s: $accepted/$frames frames encoded")
		}
	}

	@Synchronized
	fun stop()
	{
		running = false
		val t = thread
		thread = null
		if(t != null && t !== Thread.currentThread())
		{
			try
			{
				t.join(500)
			}
			catch(e: InterruptedException)
			{
			}
		}
		record?.let {
			try
			{
				it.stop()
			}
			catch(e: Exception)
			{
			}
			it.release()
		}
		record = null
	}
}
