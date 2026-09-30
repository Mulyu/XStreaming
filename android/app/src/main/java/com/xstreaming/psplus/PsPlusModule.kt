package com.xstreaming.psplus

import android.view.Surface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import kotlin.concurrent.thread

/**
 * React Native bridge over the vendored chiaki-ng/Pylux cloud-streaming
 * engine (see android/chiaki/ at the repo root -- AGPL-3.0, OpenSSL
 * exception, see /COPYING). Scoped to PS Plus cloud streaming only: there is
 * no console pairing/registration/discovery/holepunch surface here, even
 * though that code still compiles in as part of chiaki-lib (splitting it out
 * of the vendored source isn't worth the risk -- it's just never called).
 *
 * [cloudProvisionSession] and [cloudCatalogFetchUnified] are both blocking
 * native calls (the whole Kamaji/Gaikai HTTP flow, or the cached/fetched
 * unified catalog) -- both are dispatched on a background thread here, never
 * the calling (JS bridge) thread.
 */
class PsPlusModule(reactContext: ReactApplicationContext) :
	ReactContextBaseJavaModule(reactContext) {

	override fun getName() = "PsPlusChiaki"

	// The one active stream session, if any -- only one PS Plus stream can
	// run at a time. PsPlusSurfaceView reaches this via the react context to
	// attach/detach the native Surface as the view mounts/unmounts.
	//
	// @Volatile on this and currentSurface below: startSession()/
	// stopSession() run on RN's Native Modules thread while
	// PsPlusStreamView's surfaceCreated()/surfaceDestroyed() always run on
	// the UI thread. Without it, a write to either field on one thread has
	// no guaranteed visibility to a read on the other. This alone fixed one
	// real occurrence of decoder in=0 (a stale null currentSurface read),
	// but is not sufficient by itself -- see surfaceLock below for the
	// remaining gap it doesn't cover.
	@Volatile
	internal var session: Session? = null
		private set

	// The RN view mounts (and its SurfaceView's surfaceCreated fires) well
	// before startSession's provisioning/Kamaji/Gaikai round trip finishes,
	// so a fresh Session here almost always postdates that surfaceCreated
	// call -- there is no video without also pushing the already-held
	// surface onto every newly created session below, since surfaceCreated
	// won't fire again on its own (only on a real surface recreation, e.g.
	// backgrounding or rotation).
	@Volatile
	internal var currentSurface: Surface? = null
		private set

	// @Volatile makes individual reads/writes of session/currentSurface
	// visible across threads, but startSession() still does "read
	// currentSurface, then later assign session" as two separate steps --
	// if surfaceCreated()/surfaceDestroyed() lands on the UI thread in the
	// gap between those two steps, its update is visible but never acted on:
	// it either updates currentSurface after startSession() already read the
	// old value (too late for this session), or fires while session is still
	// null (its own `session?.setSurface(...)` is then a same-old no-op),
	// and nothing ever re-checks currentSurface afterward. Routing every
	// read-then-act-on(currentSurface, session) pair through this lock
	// closes that gap: whichever side loses the race still observes the
	// other side's update before making its own decision.
	private val surfaceLock = Any()

	// TEMPORARY, added after decoderSetSurfaceCalls=0 on a build with the
	// surfaceLock fix above proved Session.setSurface() was never even
	// called with a real surface this whole time -- everything above this
	// point in the chain (video_sample_cb, AMediaCodec, the surfaceLock
	// race) was never reached because the problem is further upstream
	// still. This narrows it down to one question with no device log
	// access: does PsPlusStreamView.surfaceCreated() itself ever fire at
	// all? Exposed via getSurfaceDebugInfo() below; remove together once
	// answered.
	private var surfaceCreatedCalls = 0
	private var surfaceDestroyedCalls = 0
	private var surfaceChangedCalls = 0
	private var lastSurfaceWidth = 0
	private var lastSurfaceHeight = 0

	/** Called by PsPlusStreamView as its Surface is created/destroyed. */
	internal fun attachSurface(surface: Surface?) {
		synchronized(surfaceLock) {
			if (surface != null) surfaceCreatedCalls++ else surfaceDestroyedCalls++
			currentSurface = surface
			session?.setSurface(surface)
		}
	}

	/** Called by PsPlusStreamView's surfaceChanged -- the actual laid-out size. */
	internal fun noteSurfaceChanged(width: Int, height: Int) {
		synchronized(surfaceLock) {
			surfaceChangedCalls++
			lastSurfaceWidth = width
			lastSurfaceHeight = height
		}
	}

	@ReactMethod
	fun getSurfaceDebugInfo(promise: Promise) {
		synchronized(surfaceLock) {
			promise.resolve(Arguments.createMap().apply {
				putInt("surfaceCreatedCalls", surfaceCreatedCalls)
				putInt("surfaceDestroyedCalls", surfaceDestroyedCalls)
				putInt("surfaceChangedCalls", surfaceChangedCalls)
				putInt("lastSurfaceWidth", lastSurfaceWidth)
				putInt("lastSurfaceHeight", lastSurfaceHeight)
				putBoolean("hasCurrentSurface", currentSurface != null)
				putBoolean("hasSession", session != null)
				putInt("rawSurfaceCreatedCalls", PsPlusStreamView.rawSurfaceCreatedCalls.get())
				putInt("rawPsPlusModuleNullCount", PsPlusStreamView.rawPsPlusModuleNullCount.get())
				// TEMPORARY: compare against lastAttachedModuleId -- equal means
				// this really is one misbehaving instance (rules out the
				// two-instances theory); different means the View's
				// getNativeModule() lookup and the JS bridge's NativeModules.
				// PsPlusChiaki resolve to two live PsPlusModule objects that
				// don't share state, which would fully explain surfaceCreatedCalls
				// staying 0 here despite rawSurfaceCreatedCalls being nonzero
				// with rawPsPlusModuleNullCount=0 (attachSurface() really did run,
				// just never on this object).
				putInt("thisModuleId", System.identityHashCode(this@PsPlusModule))
				putInt("lastAttachedModuleId", PsPlusStreamView.lastAttachedModuleId.get())
			})
		}
	}

	private fun emit(name: String, params: WritableMap?) {
		reactApplicationContext
			.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
			.emit(name, params)
	}

	// RN's NativeEventEmitter requires these even though events are always
	// on (no per-listener native subscription work to do here).
	@ReactMethod
	fun addListener(eventName: String) {}

	@ReactMethod
	fun removeListeners(count: Int) {}

	@ReactMethod
	fun initNativeSsl() {
		initNativeSsl(reactApplicationContext.cacheDir.absolutePath)
	}

	/**
	 * Runs the whole PSN auth + Kamaji (PSNOW only) + Gaikai allocation flow
	 * natively (see cloudsession_kamaji.c / cloudsession_gaikai.c) and
	 * resolves with the server/handshake info [startSession] needs. Emits
	 * "PsPlusProvisionProgress" ({stage: string}) events while running.
	 */
	@ReactMethod
	fun provisionCloudSession(options: ReadableMap, promise: Promise) {
		thread(name = "PsPlusProvision") {
			try {
				var cancelled = false
				val result = cloudProvisionSession(
					serviceType = options.getString("serviceType") ?: "pscloud",
					gameIdentifier = options.getString("gameIdentifier") ?: "",
					gameName = options.getString("gameName") ?: "",
					npsso = options.getString("npsso") ?: "",
					storeCountry = options.getString("storeCountry") ?: "US",
					storeLang = options.getString("storeLang") ?: "en",
					gameLanguage = options.getString("gameLanguage") ?: "en",
					ownedEntitlementId = options.getString("ownedEntitlementId") ?: "",
					ownedPlatform = options.getString("ownedPlatform") ?: "",
					forcedDatacenter = options.getString("forcedDatacenter") ?: "",
					priorDatacentersJson = options.getString("priorDatacentersJson") ?: "",
					catalogIsForeign = options.hasKey("catalogIsForeign") && options.getBoolean("catalogIsForeign"),
					resolution = if (options.hasKey("resolution")) options.getInt("resolution") else VideoResolutionPreset.RES_1080P.value,
					bitrateKbps = if (options.hasKey("bitrateKbps")) options.getInt("bitrateKbps") else 15000,
					onProgress = { stage ->
						emit("PsPlusProvisionProgress", Arguments.createMap().apply { putString("stage", stage) })
					},
					isCancelled = { cancelled },
				)
				val map = Arguments.createMap().apply {
					putInt("err", result.err)
					putString("serverIp", result.serverIp)
					putInt("serverPort", result.serverPort)
					putString("handshakeKey", result.handshakeKey)
					putString("launchSpec", result.launchSpec)
					putString("sessionId", result.sessionId)
					putString("entitlementId", result.entitlementId)
					putString("platform", result.platform)
					putInt("psnWrapperType", result.psnWrapperType)
					putInt("mtuIn", result.mtuIn)
					putInt("mtuOut", result.mtuOut)
					putInt("rttMs", result.rttMs)
					putString("datacenterPings", result.datacenterPings)
					putString("errorMessage", result.errorMessage)
				}
				promise.resolve(map)
			} catch (e: Exception) {
				promise.reject("psplus_provision_failed", e.message, e)
			}
		}
	}

	@ReactMethod
	fun fetchCatalog(npsso: String?, locale: String?, forceRefresh: Boolean, promise: Promise) {
		thread(name = "PsPlusCatalogFetch") {
			try {
				val cacheDir = File(reactApplicationContext.cacheDir, "psplus-catalog").apply { mkdirs() }
				val fetch = cloudCatalogFetchUnified(npsso, locale, cacheDir.absolutePath, forceRefresh)
				if (fetch.json != null) {
					promise.resolve(fetch.json)
				} else {
					promise.reject("psplus_catalog_failed", fetch.errorMessage ?: "unknown error")
				}
			} catch (e: Exception) {
				promise.reject("psplus_catalog_failed", e.message, e)
			}
		}
	}

	@ReactMethod
	fun invalidateCatalogCache() {
		val cacheDir = File(reactApplicationContext.cacheDir, "psplus-catalog")
		cloudCatalogInvalidateCache(cacheDir.absolutePath)
	}

	/**
	 * Starts a stream from a [provisionCloudSession] result. `options` mirrors
	 * [CloudProvisionResult]'s fields (serviceType/serverIp/serverPort/
	 * handshakeKey/launchSpec/sessionId) plus a video profile
	 * (resolutionPreset/fpsPreset/codec -- see VideoResolutionPreset/
	 * VideoFPSPreset/Codec's `value`s). No console pairing fields are ever
	 * set (registKey/morning are required-but-unused fixed-size zero arrays
	 * for a cloud connection -- see chiaki-jni.c's sessionCreate: their
	 * length is validated unconditionally, but only the cloud_* fields are
	 * actually read for CHIAKI_SERVICE_TYPE_PSCLOUD/PSNOW).
	 */
	@ReactMethod
	fun startSession(options: ReadableMap, promise: Promise) {
		try {
			session?.dispose()
			session = null

			val videoProfile = ConnectVideoProfile.preset(
				VideoResolutionPreset.values().firstOrNull { it.value == options.getInt("resolutionPreset") }
					?: VideoResolutionPreset.RES_1080P,
				VideoFPSPreset.values().firstOrNull { it.value == options.getInt("fpsPreset") }
					?: VideoFPSPreset.FPS_60,
				Codec.values().firstOrNull { it.value == options.getInt("codec") } ?: Codec.CODEC_H265,
			)

			val connectInfo = ConnectInfo(
				ps5 = true,
				host = options.getString("serverIp") ?: "",
				registKey = ByteArray(16),
				morning = ByteArray(16),
				videoProfile = videoProfile,
				serviceType = options.getString("serviceType") ?: "pscloud",
				cloudLaunchSpec = options.getString("launchSpec"),
				cloudHandshakeKey = options.getString("handshakeKey"),
				cloudSessionId = options.getString("sessionId"),
				cloudPort = if (options.hasKey("serverPort")) options.getInt("serverPort") else 0,
				cloudPsnWrapperType = if (options.hasKey("psnWrapperType")) options.getInt("psnWrapperType") else 0,
				cloudMtuIn = if (options.hasKey("mtuIn")) options.getInt("mtuIn") else 0,
				cloudMtuOut = if (options.hasKey("mtuOut")) options.getInt("mtuOut") else 0,
				cloudRttUs = if (options.hasKey("rttMs")) options.getInt("rttMs").toLong() * 1000L else 0L,
			)

			val newSession = Session(connectInfo, logFile = null, logVerbose = false)
			newSession.eventCallback = { event -> handleSessionEvent(event) }
			// The stream view's SurfaceView almost always mounted (and already
			// fired surfaceCreated) before this session existed -- see
			// currentSurface's own comment. Reading currentSurface and
			// publishing `session` happen under surfaceLock together so a
			// surfaceCreated/surfaceDestroyed racing with this can't be missed
			// (see surfaceLock's own comment) -- attachSurface() takes the
			// same lock on the UI-thread side.
			synchronized(surfaceLock) {
				currentSurface?.let { newSession.setSurface(it) }
				session = newSession
			}

			val startErr = newSession.start()
			if (!startErr.isSuccess) {
				newSession.dispose()
				session = null
				promise.reject("psplus_start_failed", startErr.toString())
				return
			}
			promise.resolve(null)
		} catch (e: CreateError) {
			session = null
			promise.reject("psplus_create_failed", e.errorCode.toString(), e)
		} catch (e: Exception) {
			session = null
			promise.reject("psplus_start_failed", e.message, e)
		}
	}

	private fun handleSessionEvent(event: Event) {
		val map = Arguments.createMap()
		when (event) {
			is ConnectedEvent -> map.putString("type", "connected")
			is LoginPinRequestEvent -> {
				map.putString("type", "loginPinRequest")
				map.putBoolean("pinIncorrect", event.pinIncorrect)
			}
			is QuitEvent -> {
				map.putString("type", "quit")
				map.putInt("reason", event.reason.value)
				map.putString("reasonString", event.reasonString)
			}
			is RumbleEvent -> {
				map.putString("type", "rumble")
				map.putInt("left", event.left.toInt())
				map.putInt("right", event.right.toInt())
			}
			is PsChordEvent -> map.putString("type", "psChord")
			// AutoRegistEvent/HolepunchEvent are console-pairing-only and never
			// fire on a cloud connection -- no mapping needed here.
			else -> return
		}
		emit("PsPlusSessionEvent", map)
	}

	@ReactMethod
	fun stopSession(promise: Promise) {
		try {
			session?.stop()
			session?.dispose()
			session = null
			promise.resolve(null)
		} catch (e: Exception) {
			promise.reject("psplus_stop_failed", e.message, e)
		}
	}

	@ReactMethod
	fun setControllerState(state: ReadableMap) {
		val current = session ?: return
		current.setControllerState(
			ControllerState(
				buttons = (if (state.hasKey("buttons")) state.getDouble("buttons").toLong() else 0L).toUInt(),
				l2State = (if (state.hasKey("l2State")) state.getInt("l2State") else 0).toUByte(),
				r2State = (if (state.hasKey("r2State")) state.getInt("r2State") else 0).toUByte(),
				leftX = (if (state.hasKey("leftX")) state.getInt("leftX") else 0).toShort(),
				leftY = (if (state.hasKey("leftY")) state.getInt("leftY") else 0).toShort(),
				rightX = (if (state.hasKey("rightX")) state.getInt("rightX") else 0).toShort(),
				rightY = (if (state.hasKey("rightY")) state.getInt("rightY") else 0).toShort(),
			)
		)
	}

	@ReactMethod
	fun setLoginPin(pin: String) {
		session?.setLoginPin(pin)
	}

	@ReactMethod
	fun getMetrics(promise: Promise) {
		val metrics = session?.getMetrics()
		if (metrics == null) {
			promise.resolve(null)
			return
		}
		promise.resolve(Arguments.createMap().apply {
			putDouble("bitrateMbps", metrics.bitrateMbps)
			putDouble("packetLoss", metrics.packetLoss)
			putDouble("droppedFrames", metrics.droppedFrames.toDouble())
			putDouble("fps", metrics.fps)
			putDouble("rttMs", metrics.rttMs)
			putInt("width", metrics.width)
			putInt("height", metrics.height)
			putInt("decoderSamplesIn", metrics.decoderSamplesIn)
			putInt("decoderBuffersOut", metrics.decoderBuffersOut)
			putInt("decoderBuffersRendered", metrics.decoderBuffersRendered)
			putBoolean("decoderConfigureFailed", metrics.decoderConfigureFailed)
			putInt("receiverAvPackets", metrics.receiverAvPackets)
			putInt("receiverFlushSuccess", metrics.receiverFlushSuccess)
			putInt("receiverFlushFecFailed", metrics.receiverFlushFecFailed)
			putInt("receiverFlushFailed", metrics.receiverFlushFailed)
			putInt("decoderSetSurfaceCalls", metrics.decoderSetSurfaceCalls)
			putBoolean("decoderWindowCreateFailed", metrics.decoderWindowCreateFailed)
			putBoolean("decoderCodecCreateFailed", metrics.decoderCodecCreateFailed)
		})
	}
}
