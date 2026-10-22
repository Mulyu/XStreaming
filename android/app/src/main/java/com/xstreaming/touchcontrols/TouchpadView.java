package com.xstreaming.touchcontrols;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

/**
 * The PS touchpad surface: reports up to two fingers as positions normalized
 * to this view (0..1), each with a touch id that stays the same from touch
 * down to touch up and is never reused for the next touch -- the PS wire
 * format tells a new touch from a continuing one by its id.
 *
 * A plain View handling its own onTouchEvent for the same reason as
 * SwipeAimView: Android's per-pointer motion-event splitting lets other
 * virtual-gamepad controls keep their own fingers.
 */
public class TouchpadView extends CustomView {
    private static final int MAX_TOUCHES = 2;
    // Touch ids are 7 bits on the wire.
    private static final int ID_MASK = 0x7f;

    // Slot i is in use when pointerIds[i] != -1.
    private final int[] pointerIds = {-1, -1};
    private final int[] touchIds = {0, 0};
    private int nextTouchId = 0;

    public TouchpadView(Context context) {
        this(context, null);
    }

    public TouchpadView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public TouchpadView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    private int slotOf(int pointerId) {
        for (int i = 0; i < MAX_TOUCHES; i++) {
            if (pointerIds[i] == pointerId) {
                return i;
            }
        }
        return -1;
    }

    private void sendTouches(MotionEvent event) {
        if (!(getContext() instanceof ReactContext)) {
            return;
        }
        float width = Math.max(1f, getWidth());
        float height = Math.max(1f, getHeight());
        WritableArray touches = Arguments.createArray();
        for (int i = 0; i < MAX_TOUCHES; i++) {
            if (pointerIds[i] == -1) {
                continue;
            }
            int index = event.findPointerIndex(pointerIds[i]);
            if (index < 0) {
                continue;
            }
            WritableMap touch = Arguments.createMap();
            touch.putInt("id", touchIds[i]);
            touch.putDouble("x", clamp01(event.getX(index) / width));
            touch.putDouble("y", clamp01(event.getY(index) / height));
            touches.pushMap(touch);
        }
        WritableMap map = Arguments.createMap();
        map.putArray("touches", touches);
        ((ReactContext) getContext()).getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), "topTouchpadChange", map);
    }

    private static double clamp01(float v) {
        return Math.max(0f, Math.min(1f, v));
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                int index = event.getActionIndex();
                int pointerId = event.getPointerId(index);
                int slot = slotOf(-1);
                if (slot >= 0 && slotOf(pointerId) < 0) {
                    pointerIds[slot] = pointerId;
                    touchIds[slot] = nextTouchId;
                    nextTouchId = (nextTouchId + 1) & ID_MASK;
                    sendTouches(event);
                }
                break;
            }
            case MotionEvent.ACTION_MOVE: {
                boolean any = false;
                for (int i = 0; i < MAX_TOUCHES; i++) {
                    if (pointerIds[i] != -1) {
                        any = true;
                    }
                }
                if (any) {
                    sendTouches(event);
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP: {
                int slot = slotOf(event.getPointerId(event.getActionIndex()));
                if (slot >= 0) {
                    pointerIds[slot] = -1;
                    sendTouches(event);
                }
                break;
            }
            case MotionEvent.ACTION_CANCEL: {
                pointerIds[0] = -1;
                pointerIds[1] = -1;
                sendTouches(event);
                break;
            }
        }
        return true;
    }
}
