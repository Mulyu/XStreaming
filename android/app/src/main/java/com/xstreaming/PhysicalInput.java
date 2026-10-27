package com.xstreaming;

import android.content.Context;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/**
 * Physical keyboard and mouse input (USB, Bluetooth, Samsung DeX) for the
 * streaming screens.
 *
 * Active only while JS has enabled it AND the stream screen is the current
 * screen (GamepadManager's currentScreen, which is cleared while the control
 * rail is open), so the rest of the app keeps normal keyboard/mouse behavior.
 * While active, keys are consumed before they reach the view hierarchy and
 * the mouse is captured (View.requestPointerCapture) so the game gets relative
 * motion instead of an OS cursor. Everything is forwarded to JS as events and
 * each provider decides what to do with it.
 *
 * All state is touched on the main thread only.
 */
final class PhysicalInput {
    // Mouse deltas are batched to roughly this interval so a 1000 Hz mouse
    // doesn't flood the React Native bridge.
    private static final long MOVE_FLUSH_DELAY_MS = 8;

    // The stream screen's "current screen" flag can flip off and straight
    // back on (a React effect re-running clears it in its cleanup and sets it
    // again moments later). Reacting to the off half would drop the pointer
    // capture and release every held key for a blink, so capture and held
    // input are kept this long before an off flag counts.
    private static final long INACTIVE_GRACE_MS = 300;

    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static WeakReference<MainActivity> activityRef = new WeakReference<>(null);
    private static View captureView;

    private static boolean enabled = false;
    // Key-capture mode (see setKeyCapture): independent of `enabled` and of
    // which screen is current.
    private static volatile boolean keyCapture = false;
    // Ctrl+Alt+Shift+Z toggles this: the player gets the OS cursor back
    // (e.g. to click the control rail) until it is toggled again.
    private static boolean userReleased = false;

    private static final Set<Integer> pressedKeys = new HashSet<>();
    // Keys that were part of a handled shortcut; their release is swallowed.
    private static final Set<Integer> swallowedKeys = new HashSet<>();
    private static int lastButtonState = 0;
    private static float accX = 0f;
    private static float accY = 0f;
    private static boolean flushScheduled = false;
    // Input device add/remove/change callbacks since the last logged capture
    // transition -- DeX can emit these constantly, which is worth knowing when
    // diagnosing capture that drops.
    private static int deviceEvents = 0;

    // A mouse event arrived while the stream was active: proof enough that a
    // mouse is present, whatever the device list says (on some TVs a working
    // mouse never passes the list check). Cleared when the stream stops being
    // active.
    private static boolean mouseSeenViaEvent = false;
    private static long lastEventDrivenUpdateAt = 0;

    private static final Runnable FLUSH = () -> {
        flushScheduled = false;
        flushMove();
    };

    // Uptime (ms) the screen flag was first seen off, 0 while on.
    private static long inactiveSince = 0;
    private static final Runnable RECHECK = PhysicalInput::update;

    private PhysicalInput() {}

    static void attach(MainActivity activity) {
        activityRef = new WeakReference<>(activity);
    }

    /** Called from the JS module, any thread. */
    static void setEnabled(boolean value) {
        mainHandler.post(() -> {
            enabled = value;
            if (!value) {
                userReleased = false;
            }
            update();
        });
    }

    /**
     * While on, physical keyboard presses are emitted as onPhysicalKey and
     * swallowed on any screen, so the input-mapping editor can learn which
     * key the user pressed. Called from the JS module, any thread.
     */
    static void setKeyCapture(boolean value) {
        keyCapture = value;
    }

    /**
     * MainActivity: a mouse event that reached the activity (not the capture
     * view) -- hover and scroll through onGenericMotionEvent, clicks as touches
     * through dispatchTouchEvent. Starts the capture even when the device list
     * does not recognise the mouse, and retries it (calmly) while the mouse
     * keeps moving without being captured.
     */
    static void noteUncapturedMouse(MotionEvent event) {
        if (!event.isFromSource(InputDevice.SOURCE_MOUSE)
                || event.isFromSource(InputDevice.SOURCE_MOUSE_RELATIVE)
                || !isActive()) {
            return;
        }
        long now = SystemClock.uptimeMillis();
        if (!mouseSeenViaEvent) {
            mouseSeenViaEvent = true;
            update();
        } else if (captureView != null && !captureView.hasPointerCapture()
                && now - lastEventDrivenUpdateAt > 500) {
            lastEventDrivenUpdateAt = now;
            update();
        }
    }

    /** Called when the current screen changes (stream <-> not), any thread. */
    static void onScreenChanged() {
        mainHandler.post(PhysicalInput::update);
    }

    static void onWindowFocusChanged(boolean hasFocus) {
        if (!hasFocus) {
            releaseAll();
        }
        update();
    }

    static void onInputDevicesChanged() {
        deviceEvents++;
        update();
    }

    /** Logs capture transitions (only) to the app debug log, to diagnose capture that drops. */
    private static void log(String message) {
        MainActivity activity = activity();
        if (activity != null) {
            AppDebugLog.log(activity, "PhysicalInput", message);
        }
    }

    private static String stateSummary(MainActivity activity) {
        return "active=" + isActive()
                + " userReleased=" + userReleased
                + " windowFocus=" + activity.hasWindowFocus()
                + " deviceEvents=" + deviceEvents;
    }

    /** The 1px view that holds focus (and so pointer capture) while a stream is active. */
    private static final class CaptureView extends View {
        CaptureView(Context context) {
            super(context);
        }

        @Override
        public void onPointerCaptureChange(boolean hasCapture) {
            super.onPointerCaptureChange(hasCapture);
            MainActivity activity = activity();
            log("captureChanged hasCapture=" + hasCapture + " focused=" + isFocused()
                    + (activity != null ? " " + stateSummary(activity) : ""));
            deviceEvents = 0;
        }

        @Override
        protected void onFocusChanged(boolean gainFocus, int direction, Rect previouslyFocusedRect) {
            super.onFocusChanged(gainFocus, direction, previouslyFocusedRect);
            log("captureViewFocus gained=" + gainFocus);
        }
    }

    private static MainActivity activity() {
        return activityRef.get();
    }

    private static boolean isActive() {
        return enabled && "stream".equals(GamepadManager.getCurrentScreen());
    }

    /** Active, or within the grace period after the screen flag flipped off. */
    private static boolean isLive() {
        return isActive() || inactiveSince != 0;
    }

    /**
     * A mouse (USB, Bluetooth, DeX), as opposed to a gamepad whose touchpad
     * also advertises a mouse source. The source constants share class bits
     * (SOURCE_KEYBOARD and SOURCE_DPAD carry SOURCE_CLASS_BUTTON, like
     * SOURCE_GAMEPAD), so a plain "& mask != 0" would also throw out any mouse
     * that doubles as a keyboard or D-pad (media keys, air-mouse remotes):
     * each source has to match in full.
     */
    private static boolean isMouseDevice(InputDevice device) {
        if (device == null || !device.supportsSource(InputDevice.SOURCE_MOUSE)) {
            return false;
        }
        int sources = device.getSources();
        boolean gamepadLike = (sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        return !gamepadLike;
    }

    private static boolean hasMouse() {
        for (int id : InputDevice.getDeviceIds()) {
            if (isMouseDevice(InputDevice.getDevice(id))) {
                return true;
            }
        }
        return false;
    }

    private static View ensureCaptureView(MainActivity activity) {
        if (captureView == null || captureView.getContext() != activity) {
            View view = new CaptureView(activity);
            view.setFocusable(true);
            view.setFocusableInTouchMode(true);
            view.setOnCapturedPointerListener((v, event) -> handleCapturedPointer(event));
            // Pointer capture is delivered to the focused view only, and the
            // React Native root isn't a focus target, so a 1px view of our
            // own holds the focus while capturing.
            activity.addContentView(view, new FrameLayout.LayoutParams(1, 1));
            captureView = view;
        }
        return captureView;
    }

    private static void update() {
        MainActivity activity = activity();
        if (activity == null) {
            return;
        }
        boolean active = isActive();
        boolean captured = captureView != null && captureView.hasPointerCapture();
        boolean canKeep = active && !userReleased && activity.hasWindowFocus();
        // A mouse is only needed to *start* capturing. Once captured, a device
        // list that momentarily lacks one (devices being re-enumerated, which
        // DeX does) must not drop the capture.
        boolean wantCapture = canKeep && (captured || hasMouse() || mouseSeenViaEvent);
        if (wantCapture) {
            inactiveSince = 0;
            mainHandler.removeCallbacks(RECHECK);
            View view = ensureCaptureView(activity);
            if (!view.hasPointerCapture()) {
                log("request " + stateSummary(activity));
                view.setFocusable(true);
                view.setFocusableInTouchMode(true);
                view.requestFocus();
                view.requestPointerCapture();
            }
            return;
        }
        if (!active && enabled && !userReleased && activity.hasWindowFocus()
                && inactiveGraceRunning()) {
            return;
        }
        inactiveSince = 0;
        if (captured) {
            log("release " + stateSummary(activity) + " hasMouse=" + hasMouse());
            captureView.releasePointerCapture();
        }
        // The capture view took the focus to hold the capture. Left focusable
        // it keeps that focus after the stream (D-pad / keyboard navigation in
        // the app then starts from an invisible 1px view), so give it back.
        if (captureView != null && captureView.isFocusable()) {
            captureView.clearFocus();
            captureView.setFocusable(false);
            captureView.setFocusableInTouchMode(false);
        }
        if (!active) {
            mouseSeenViaEvent = false;
            releaseAll();
        }
    }

    /** True while the screen flag has been off for less than the grace period. */
    private static boolean inactiveGraceRunning() {
        long now = SystemClock.uptimeMillis();
        if (inactiveSince == 0) {
            inactiveSince = now;
            mainHandler.postDelayed(RECHECK, INACTIVE_GRACE_MS);
            return true;
        }
        return now - inactiveSince < INACTIVE_GRACE_MS;
    }

    private static boolean isPhysicalKeyboard(KeyEvent event) {
        InputDevice device = event.getDevice();
        if (device == null || device.isVirtual()) {
            return false;
        }
        if ((event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
            return false;
        }
        return (device.getSources() & InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD
                && device.getKeyboardType() == InputDevice.KEYBOARD_TYPE_ALPHABETIC;
    }

    /** MainActivity.dispatchKeyEvent. Returns true if the event was consumed. */
    static boolean handleKeyEvent(KeyEvent event) {
        if (keyCapture && isPhysicalKeyboard(event) && !event.isSystem()) {
            int captureAction = event.getAction();
            if (captureAction == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                emitKey(event.getKeyCode(), event.getScanCode(), true, event.getMetaState());
            }
            return true;
        }
        // Keys keep flowing through a brief flag flip so a key released
        // during it isn't left stuck down.
        if (!isLive()) {
            return false;
        }
        int action = event.getAction();
        if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) {
            return false;
        }
        boolean down = action == KeyEvent.ACTION_DOWN;
        int keyCode = event.getKeyCode();

        if (swallowedKeys.contains(keyCode)) {
            if (!down) {
                swallowedKeys.remove(keyCode);
            }
            return true;
        }
        if (!isPhysicalKeyboard(event)) {
            return false;
        }

        if (down) {
            if (event.getRepeatCount() > 0) {
                // The remote side handles auto-repeat itself.
                return pressedKeys.contains(keyCode);
            }
            if (event.isCtrlPressed() && event.isAltPressed() && event.isShiftPressed()
                    && (keyCode == KeyEvent.KEYCODE_Z || keyCode == KeyEvent.KEYCODE_M)) {
                swallowedKeys.add(keyCode);
                releaseAll();
                if (keyCode == KeyEvent.KEYCODE_Z) {
                    userReleased = !userReleased;
                    update();
                } else {
                    emit("onPhysicalMenu", Arguments.createMap());
                }
                return true;
            }
            // Back, volume, power, etc. keep their system behavior.
            if (event.isSystem()) {
                return false;
            }
            pressedKeys.add(keyCode);
            emitKey(keyCode, event.getScanCode(), true, event.getMetaState());
            return true;
        }

        if (pressedKeys.remove(keyCode)) {
            emitKey(keyCode, event.getScanCode(), false, event.getMetaState());
            return true;
        }
        return false;
    }

    private static boolean handleCapturedPointer(MotionEvent event) {
        if (!isLive()) {
            return false;
        }
        if (!event.isFromSource(InputDevice.SOURCE_MOUSE_RELATIVE)) {
            // A captured touchpad reports absolute positions; not handled.
            return true;
        }
        int action = event.getActionMasked();

        if (action == MotionEvent.ACTION_SCROLL) {
            flushMove();
            WritableMap map = Arguments.createMap();
            map.putDouble("x", event.getAxisValue(MotionEvent.AXIS_HSCROLL));
            map.putDouble("y", event.getAxisValue(MotionEvent.AXIS_VSCROLL));
            emit("onPhysicalMouseWheel", map);
            return true;
        }

        // Each sample's X/Y is its own delta since the previous sample, so
        // batched history has to be summed in as well.
        float dx = event.getX();
        float dy = event.getY();
        for (int h = 0; h < event.getHistorySize(); h++) {
            dx += event.getHistoricalX(h);
            dy += event.getHistoricalY(h);
        }
        if (dx != 0f || dy != 0f) {
            accX += dx;
            accY += dy;
            if (!flushScheduled) {
                flushScheduled = true;
                mainHandler.postDelayed(FLUSH, MOVE_FLUSH_DELAY_MS);
            }
        }

        int buttonState = event.getButtonState();
        int changed = buttonState ^ lastButtonState;
        if (changed != 0) {
            // Keep motion ordered before the button change it belongs to.
            flushMove();
            emitButtonChanges(changed, buttonState);
            lastButtonState = buttonState;
        }
        return true;
    }

    private static void emitButtonChanges(int changed, int buttonState) {
        // DOM MouseEvent.button numbering: 0 left, 1 middle, 2 right, 3 back,
        // 4 forward.
        int[][] map = {
                {MotionEvent.BUTTON_PRIMARY, 0},
                {MotionEvent.BUTTON_TERTIARY, 1},
                {MotionEvent.BUTTON_SECONDARY, 2},
                {MotionEvent.BUTTON_BACK, 3},
                {MotionEvent.BUTTON_FORWARD, 4},
        };
        for (int[] entry : map) {
            if ((changed & entry[0]) != 0) {
                emitButton(entry[1], (buttonState & entry[0]) != 0);
            }
        }
    }

    private static void flushMove() {
        int ix = Math.round(accX);
        int iy = Math.round(accY);
        if (ix == 0 && iy == 0) {
            return;
        }
        // Carry the sub-pixel remainder so slow movement isn't lost.
        accX -= ix;
        accY -= iy;
        WritableMap map = Arguments.createMap();
        map.putInt("dx", ix);
        map.putInt("dy", iy);
        emit("onPhysicalMouseMove", map);
    }

    /** Releases everything held so a key or button can't stay stuck down. */
    private static void releaseAll() {
        flushMove();
        accX = 0f;
        accY = 0f;
        for (int keyCode : new ArrayList<>(pressedKeys)) {
            emitKey(keyCode, 0, false, 0);
        }
        pressedKeys.clear();
        swallowedKeys.clear();
        if (lastButtonState != 0) {
            emitButtonChanges(lastButtonState, 0);
            lastButtonState = 0;
        }
    }

    private static void emitKey(int keyCode, int scanCode, boolean down, int metaState) {
        WritableMap map = Arguments.createMap();
        map.putInt("keyCode", keyCode);
        map.putInt("scanCode", scanCode);
        map.putBoolean("down", down);
        map.putInt("metaState", metaState);
        emit("onPhysicalKey", map);
    }

    private static void emitButton(int button, boolean down) {
        WritableMap map = Arguments.createMap();
        map.putInt("button", button);
        map.putBoolean("down", down);
        emit("onPhysicalMouseButton", map);
    }

    private static void emit(String name, WritableMap params) {
        MainActivity activity = activity();
        if (activity != null) {
            activity.sendEvent(name, params);
        }
    }
}
