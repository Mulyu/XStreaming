import React from 'react';
import {requireNativeComponent, ViewProps} from 'react-native';

export type PsPlusStreamViewProps = ViewProps & {
  /** 'top' | 'center' | 'bottom' -- vertical anchor for the letterboxed/
   * pillarboxed video within this view's bounds (horizontal is always
   * centered). Mirrors native-stream's own screen_position setting exactly
   * -- see PsPlusStreamView.kt's onLayout() for the native implementation. */
  screenPosition?: string;
  /** '' (auto, native 16:9) | 'Stretch' | 'Zoom' | 'W:H' (e.g. '4:3') --
   * mirrors native-stream's own video_format setting exactly. */
  videoFormat?: string;
};

// Hosts the Surface android/app/.../psplus/PsPlusStreamView.kt decodes PS
// Plus cloud-stream video frames into. Drives itself by reaching into the
// native PsPlusModule's active session (see that class's own doc comment),
// the same way entities/gamepad's AnalogStick wraps its own native view --
// screenPosition/videoFormat are the only real data props, both purely
// layout (see PsPlusStreamView.kt), nothing session-related.
const NativePsPlusStreamView =
  requireNativeComponent<PsPlusStreamViewProps>('PsPlusStreamView');

const PsPlusStreamView: React.FC<PsPlusStreamViewProps> = props => (
  <NativePsPlusStreamView {...props} />
);

export default PsPlusStreamView;
