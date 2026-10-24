import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {CoverScreenViewModel} from '../model/useCoverScreen';
import {alpha, palette} from '../../../shared/config/palette';

type Props = CoverScreenViewModel;

const CoverScreenView: React.FC<Props> = ({
  active,
  layout,
  surface,
  pressed,
  onSurfaceLayout,
}) => {
  if (!active) {
    return (
      <View style={styles.idleWrap}>
        <Text style={styles.brand}>AnyStreaming</Text>
        <Text style={styles.idleText}>Start a game to use cover controls</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.wrap}
      onLayout={e => {
        const {width, height} = e.nativeEvent.layout;
        onSurfaceLayout(width, height);
      }}>
      {layout.map(b => {
        if (!b.show || surface.width === 0) {
          return null;
        }
        const side = b.size * surface.width;
        const down = pressed.includes(b.name);
        return (
          <View
            key={b.name}
            pointerEvents="none"
            style={[
              styles.button,
              {
                left: b.x * surface.width,
                top: b.y * surface.height,
                width: side,
                height: side,
              },
              down && styles.buttonDown,
            ]}>
            <Text style={[styles.buttonLabel, down && styles.buttonLabelDown]}>
              {b.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  idleWrap: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  brand: {
    color: palette.accent,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  idleText: {
    color: palette.textSoft,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  wrap: {flex: 1, backgroundColor: palette.bg},
  button: {
    position: 'absolute',
    borderRadius: 16,
    backgroundColor: alpha(palette.white, 0.08),
    borderWidth: 1,
    borderColor: alpha(palette.white, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDown: {
    backgroundColor: alpha(palette.accent, 0.28),
    borderColor: palette.accent,
  },
  buttonLabel: {color: palette.text, fontSize: 22, fontWeight: '800'},
  buttonLabelDown: {color: palette.white},
});

export default CoverScreenView;
