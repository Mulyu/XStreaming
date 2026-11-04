import 'react-native';
import type {NativeSyntheticEvent, TargetedEvent} from 'react-native';

// Focus handlers on view-like components. react-native-paper's Button, Chip,
// Card and Checkbox.Item pass unknown props down to their Pressable, so the
// TV focus handlers (see shared/ui/tvFocus) work on them at runtime, but their
// prop types are built on ViewProps, which has no onFocus/onBlur.
declare module 'react-native' {
  interface ViewProps {
    onFocus?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
    onBlur?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
  }
}
