package com.xstreaming.touchcontrols;

import androidx.annotation.NonNull;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

import java.util.Map;

public class SwipeAimViewManager extends SimpleViewManager<SwipeAimView> {
    @NonNull
    @Override
    public String getName() {
        return "SwipeAimView";
    }

    @NonNull
    @Override
    protected SwipeAimView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new SwipeAimView(reactContext);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topSwipeAimMove", MapBuilder.of("registrationName", "onSwipeAimMove"))
                .put("topSwipeAimEnd", MapBuilder.of("registrationName", "onSwipeAimEnd"))
                .build();
    }
}
