package com.xstreaming.psplus

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PsPlusPackage : ReactPackage {
	override fun createNativeModules(
		reactContext: ReactApplicationContext
	): List<NativeModule> = listOf(PsPlusModule(reactContext))

	override fun createViewManagers(
		reactContext: ReactApplicationContext
	): List<ViewManager<*, *>> = listOf(PsPlusStreamViewManager())
}
