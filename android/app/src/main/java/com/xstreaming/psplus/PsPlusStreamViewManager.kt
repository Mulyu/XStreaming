package com.xstreaming.psplus

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class PsPlusStreamViewManager : SimpleViewManager<PsPlusStreamView>() {
	override fun getName() = "PsPlusStreamView"

	override fun createViewInstance(reactContext: ThemedReactContext): PsPlusStreamView =
		PsPlusStreamView(reactContext)
}
