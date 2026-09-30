package com.xstreaming.psplus

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class PsPlusStreamViewManager : SimpleViewManager<PsPlusStreamView>() {
	override fun getName() = "PsPlusStreamView"

	override fun createViewInstance(reactContext: ThemedReactContext): PsPlusStreamView =
		PsPlusStreamView(reactContext)

	// Same prop names as com.oney.WebRTCModule.RTCFsrVideoViewManager's
	// videoFormat/screenPosition, so native-stream's identical Settings
	// choices apply unchanged to this stream too.
	@ReactProp(name = "videoFormat")
	fun setVideoFormat(view: PsPlusStreamView, videoFormat: String?) {
		view.setVideoFormat(videoFormat)
	}

	@ReactProp(name = "screenPosition")
	fun setScreenPosition(view: PsPlusStreamView, screenPosition: String?) {
		view.setScreenPosition(screenPosition)
	}
}
