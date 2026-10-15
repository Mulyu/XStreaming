package com.xstreaming.touchcontrols;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

/**
 * Native replacement for the old Gesture.Pan()-based SwipeAimZone.tsx. Every
 * other touch-interactive piece of the virtual gamepad (ButtonView,
 * AnalogStickView) is a plain Android View handling its own onTouchEvent --
 * react-native-gesture-handler was the only thing in that whole touch stack
 * NOT built that way, and mixing the two meant a finger actively tracked by
 * a Gesture.Pan() could keep other, unrelated ButtonViews elsewhere on
 * screen from receiving their own touches for as long as the swipe was in
 * progress. A plain View here gets Android's own default per-pointer
 * motion-event splitting across sibling views for free -- the same
 * mechanism that already lets a ButtonView and an AnalogStickView each take
 * their own finger simultaneously -- so a second finger over a button, even
 * one that overlaps this view's own rect, is routed to that button instead
 * of here, exactly like it would be if this were another ButtonView.
 */
public class SwipeAimView extends CustomView {
    private int pointerId = -1;
    private float lastX = 0f;
    private float lastY = 0f;

    public SwipeAimView(Context context) {
        this(context, null);
    }

    public SwipeAimView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public SwipeAimView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    private void sendMoveEvent(float dx, float dy) {
        if (!(getContext() instanceof ReactContext)) {
            return;
        }
        WritableMap event = Arguments.createMap();
        event.putDouble("dx", dx);
        event.putDouble("dy", dy);
        ((ReactContext) getContext()).getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), "topSwipeAimMove", event);
    }

    private void sendEndEvent() {
        if (!(getContext() instanceof ReactContext)) {
            return;
        }
        ((ReactContext) getContext()).getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), "topSwipeAimEnd", null);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                // Only the first finger to land in this view's own bounds
                // drives aiming -- a second finger down here (the other
                // hand reaching across) is ignored, same as SwipeAimZone's
                // previous touchId gate.
                if (pointerId == -1) {
                    int index = event.getActionIndex();
                    pointerId = event.getPointerId(index);
                    lastX = event.getX(index);
                    lastY = event.getY(index);
                }
                break;
            }
            case MotionEvent.ACTION_MOVE: {
                if (pointerId != -1) {
                    int index = event.findPointerIndex(pointerId);
                    if (index >= 0) {
                        float x = event.getX(index);
                        float y = event.getY(index);
                        float dx = x - lastX;
                        float dy = y - lastY;
                        lastX = x;
                        lastY = y;
                        if (dx != 0f || dy != 0f) {
                            sendMoveEvent(dx, dy);
                        }
                    }
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP: {
                if (pointerId != -1
                        && event.getPointerId(event.getActionIndex()) == pointerId) {
                    pointerId = -1;
                    sendEndEvent();
                }
                break;
            }
            case MotionEvent.ACTION_CANCEL: {
                if (pointerId != -1) {
                    pointerId = -1;
                    sendEndEvent();
                }
                break;
            }
        }
        return true;
    }
}
