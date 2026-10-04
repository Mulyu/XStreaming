import React from 'react';

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
// track focus itself (plain onFocus/onBlur props -- confirmed these work on
// Android in this RN version despite the misleading "@platform macos
// windows" comment on their .d.ts) and apply a visible style manually.
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
  onFocus: () => void;
  onBlur: () => void;
};

// The one piece of state + two handlers every focusable element needs.
// Deliberately not a wrapper component (so it drops into an existing
// Pressable/Button/IconButton's own `style` array/prop without changing
// that element's structure) -- see shared/ui/RailControls.tsx for the one
// place this app also factors out a couple of whole focusable components.
export function useTVFocus(): TVFocusState {
  const [focused, setFocused] = React.useState(false);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}
