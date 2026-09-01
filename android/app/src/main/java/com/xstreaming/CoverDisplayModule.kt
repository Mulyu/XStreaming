package com.xstreaming

import android.content.Context
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import androidx.window.area.WindowAreaCapability
import androidx.window.area.WindowAreaController
import androidx.window.area.WindowAreaInfo
import androidx.window.area.WindowAreaPresentationSessionCallback
import androidx.window.area.WindowAreaSessionPresenter
import androidx.window.core.ExperimentalWindowApi

import com.facebook.react.ReactApplication
import com.facebook.react.ReactRootView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

/**
 * PoC bridge for showing separate React Native content on a foldable's cover
 * (outer) display while the main display stays on, via Jetpack WindowManager's
 * Dual Screen Mode (WindowAreaController.presentContentOnWindowArea /
 * OPERATION_PRESENT_ON_AREA).
 *
 * The presented content is a second ReactRootView started on the SAME
 * ReactInstanceManager, so it shares the app's single JS context (Redux etc.).
 */
@OptIn(ExperimentalWindowApi::class)
class CoverDisplayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val controller: WindowAreaController by lazy {
    WindowAreaController.getOrCreate()
  }
  private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private var presenter: WindowAreaSessionPresenter? = null
  private var coverRootView: ReactRootView? = null
  private var lastStatus: String? = null

  override fun getName(): String = "CoverDisplayManager"

  private val presentOp = WindowAreaCapability.Operation.OPERATION_PRESENT_ON_AREA

  init {
    // Observe present-capability changes (e.g. the foldable being opened /
    // closed) and push each new status to JS so the app can auto-enable the
    // cover controls when the device is unfolded.
    scope.launch {
      try {
        controller.windowAreaInfos.collect { infos ->
          val status =
              statusString(
                  infos
                      .asSequence()
                      .mapNotNull { it.getCapability(presentOp) }
                      .firstOrNull()
                      ?.status)
          if (status != lastStatus) {
            lastStatus = status
            emitStatus(status)
          }
        }
      } catch (ignored: Throwable) {
      }
    }
  }

  private fun statusString(status: WindowAreaCapability.Status?): String =
      when (status) {
        WindowAreaCapability.Status.WINDOW_AREA_STATUS_AVAILABLE -> "AVAILABLE"
        WindowAreaCapability.Status.WINDOW_AREA_STATUS_UNAVAILABLE -> "UNAVAILABLE"
        WindowAreaCapability.Status.WINDOW_AREA_STATUS_ACTIVE -> "ACTIVE"
        else -> "UNSUPPORTED"
      }

  private suspend fun currentInfos(): List<WindowAreaInfo> =
      try {
        controller.windowAreaInfos.firstOrNull() ?: emptyList()
      } catch (e: Throwable) {
        emptyList()
      }

  /** Returns AVAILABLE / UNAVAILABLE / ACTIVE / UNSUPPORTED for present mode. */
  @ReactMethod
  fun getStatus(promise: Promise) {
    scope.launch {
      val cap =
          currentInfos()
              .asSequence()
              .mapNotNull { it.getCapability(presentOp) }
              .firstOrNull()
      promise.resolve(statusString(cap?.status))
    }
  }

  /** Present the given (AppRegistry-registered) JS component on the cover area. */
  @ReactMethod
  fun present(componentName: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("no_activity", "No current activity")
      return
    }
    scope.launch {
      val info =
          currentInfos().firstOrNull {
            it.getCapability(presentOp)?.status ==
                WindowAreaCapability.Status.WINDOW_AREA_STATUS_AVAILABLE
          }
      if (info == null) {
        promise.reject("unavailable", "Cover-display present mode not available")
        return@launch
      }
      try {
        controller.presentContentOnWindowArea(
            token = info.token,
            activity = activity,
            executor = ContextCompat.getMainExecutor(activity),
            windowAreaPresentationSessionCallback =
                object : WindowAreaPresentationSessionCallback {
                  override fun onSessionStarted(session: WindowAreaSessionPresenter) {
                    presenter = session
                    val app =
                        reactApplicationContext.applicationContext as ReactApplication
                    val manager = app.reactNativeHost.reactInstanceManager
                    val rootView = ReactRootView(session.context)
                    rootView.startReactApplication(manager, componentName, null)
                    coverRootView = rootView
                    // Host the cover React root inside a layout that intercepts
                    // touches and forwards their coordinates to JS. The cover is
                    // a second ReactRootView on the same ReactInstanceManager, so
                    // it would otherwise share the app's single JS gesture
                    // responder — touching the inner display would steal (and
                    // terminate) the cover's responder, dropping any held cover
                    // button. Intercepting natively keeps the two displays'
                    // touch streams independent.
                    val touchLayout = CoverTouchLayout(session.context)
                    touchLayout.addView(
                        rootView,
                        FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT))
                    session.setContentView(touchLayout)
                    emit("started")
                  }

                  override fun onSessionEnded(t: Throwable?) {
                    cleanup()
                    emit("ended")
                  }

                  override fun onContainerVisibilityChanged(isVisible: Boolean) {
                    emit(if (isVisible) "visible" else "hidden")
                  }
                })
        promise.resolve(true)
      } catch (e: Throwable) {
        promise.reject("present_error", e.message, e)
      }
    }
  }

  /** Close the cover-display session. */
  @ReactMethod
  fun dismiss() {
    UiThreadUtil.runOnUiThread {
      try {
        presenter?.close()
      } catch (ignored: Throwable) {
      }
      cleanup()
    }
  }

  private fun cleanup() {
    coverRootView = null
    presenter = null
  }

  /**
   * Wraps the cover React root and swallows all touches, dispatching their
   * coordinates to JS as a "CoverTouch" event instead of letting React Native's
   * (instance-global) gesture responder process them.
   */
  private inner class CoverTouchLayout(context: Context) : FrameLayout(context) {
    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean = true

    override fun onTouchEvent(event: MotionEvent): Boolean {
      emitTouches(event)
      return true
    }
  }

  private fun emitTouches(event: MotionEvent) {
    val touches = Arguments.createArray()
    val action = event.actionMasked
    val allReleased =
        action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL
    if (!allReleased) {
      val liftedIndex =
          if (action == MotionEvent.ACTION_POINTER_UP) event.actionIndex else -1
      for (i in 0 until event.pointerCount) {
        if (i == liftedIndex) {
          continue
        }
        val point = Arguments.createMap()
        point.putDouble("x", event.getX(i).toDouble())
        point.putDouble("y", event.getY(i).toDouble())
        touches.pushMap(point)
      }
    }
    val payload = Arguments.createMap()
    payload.putArray("touches", touches)
    try {
      reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("CoverTouch", payload)
    } catch (ignored: Throwable) {}
  }

  private fun emit(event: String) {
    try {
      reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("CoverDisplayEvent", event)
    } catch (ignored: Throwable) {
    }
  }

  private fun emitStatus(status: String) {
    try {
      reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("CoverDisplayStatus", status)
    } catch (ignored: Throwable) {
    }
  }

  // Required so NativeEventEmitter doesn't warn on JS side.
  @ReactMethod fun addListener(eventName: String) {}

  @ReactMethod fun removeListeners(count: Int) {}
}
