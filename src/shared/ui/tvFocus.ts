import React from 'react';
import {DeviceEventEmitter, findNodeHandle} from 'react-native';

// Android TV / Google TV D-pad navigation has no visible "hover" the way a
// mouse cursor does, and nothing in this app draws one for free: Pressable's
// android_ripple only fires on press, not on focus-without-press; react-
// native-paper's TouchableRipple has its own focus support explicitly
// stubbed out (see its "focused state is not ready yet" comment, citing
// https://github.com/necolas/react-native-web/issues/1849); and this app
// pins plain "react-native": "0.72.14" (confirmed in package.json), not the
// react-native-tvos fork, so Pressable's `style={({focused}) => ...}`
// render-prop isn't available either (PressableStateCallbackType only has
// `pressed` in this RN version). There's also no native-side fallback:
// android/app/src/main/res/values/styles.xml has no focus-highlight
// selector of its own. Every focusable element in this app must therefore
// track focus itself and apply a visible style manually.
export const TV_FOCUS_COLOR = '#FFD54A';

// A 2px ring in the one color used for this across the app (ported from
// native-stream's own StreamControlRail, the first place this pattern was
// established) -- apply via `focused && tvFocusRing` in a style array.
export const tvFocusRing = {
  borderWidth: 2,
  borderColor: TV_FOCUS_COLOR,
} as const;

export type TVFocusState = {
  focused: boolean;
  // Attach this to the exact element whose focus state `focused` reports --
  // see this file's own comment on why it's required now.
  ref: React.RefObject<any>;
  // Kept only so existing call sites (`onFocus={x.onFocus}`) don't need to
  // change: harmless no-ops now that the mechanism below doesn't depend on
  // them, in case a future RN upgrade makes them real again.
  onFocus: () => void;
  onBlur: () => void;
};

// Confirmed on real Google TV hardware (see LibraryView.tsx's own
// diagnostic, which tried six independently-colored styles gated purely on
// onFocus/onBlur firing -- none ever appeared): a plain Pressable/View's
// onFocus/onBlur props never fire on Android in this RN version at all.
// Traced to the root cause: RN's Android BaseViewConfig has no topFocus/
// topBlur direct-event registration for a generic View (confirmed against
// BaseViewConfig.ios.js, which does have one, and against
// ReactTextInputManager.java, the one place in RN core that *does* wire a
// real setOnFocusChangeListener -- TextInput only). Real Android focus
// movement itself is unaffected; only the event that would tell JS about it
// was missing.
//
// The actual bridge: MainActivity.java now attaches one
// ViewTreeObserver.OnGlobalFocusChangeListener to the whole window, which
// fires on every focus change anywhere in it (native-Android-side, so it
// doesn't depend on Pressable's own non-functional event props) and emits
// the newly-focused view's tag as `onNativeFocusChange`. Each element here
// compares that tag against its own via findNodeHandle(ref) to know whether
// it specifically is the one now focused -- a global event, not a per-
// element one, so every call site needs its own `ref` (new as of this
// fix) rather than just `onFocus`/`onBlur`.
export function useTVFocus(): TVFocusState {
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef<any>(null);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onNativeFocusChange',
      (event: {tag: number}) => {
        const myTag = findNodeHandle(ref.current);
        setFocused(myTag != null && myTag === event.tag);
      },
    );
    return () => sub.remove();
  }, []);

  return {
    focused,
    ref,
    onFocus: () => {},
    onBlur: () => {},
  };
}
