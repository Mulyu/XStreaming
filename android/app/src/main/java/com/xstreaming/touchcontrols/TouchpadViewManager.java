package com.xstreaming.touchcontrols;

import androidx.annotation.NonNull;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

import java.util.Map;

public class TouchpadViewManager extends SimpleViewManager<TouchpadView> {
    @NonNull
    @Override
    public String getName() {
        return "TouchpadView";
    }

    @NonNull
    @Override
    protected TouchpadView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new TouchpadView(reactContext);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topTouchpadChange", MapBuilder.of("registrationName", "onTouchpadChange"))
                .build();
    }
}
