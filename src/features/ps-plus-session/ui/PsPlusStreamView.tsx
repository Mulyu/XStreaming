import React from 'react';
import {requireNativeComponent, ViewProps} from 'react-native';

// Hosts the Surface android/app/.../psplus/PsPlusStreamView.kt decodes PS
// Plus cloud-stream video frames into. No data props: it drives itself by
// reaching into the native PsPlusModule's active session (see that class's
// own doc comment), the same way entities/gamepad's AnalogStick wraps its
// own native view.
const NativePsPlusStreamView =
  requireNativeComponent<ViewProps>('PsPlusStreamView');

const PsPlusStreamView: React.FC<ViewProps> = props => (
  <NativePsPlusStreamView {...props} />
);

export default PsPlusStreamView;
