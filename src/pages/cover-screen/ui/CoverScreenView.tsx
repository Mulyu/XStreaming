import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {CoverScreenViewModel} from '../model/useCoverScreen';

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
        <Text style={styles.brand}>XStreaming</Text>
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
    backgroundColor: '#0E1512',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  brand: {color: '#2FD24B', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  idleText: {color: '#8A9A92', fontSize: 13, marginTop: 8, textAlign: 'center'},
  wrap: {flex: 1, backgroundColor: '#0E1512'},
  button: {
    position: 'absolute',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDown: {
    backgroundColor: 'rgba(47,210,75,0.28)',
    borderColor: '#2FD24B',
  },
  buttonLabel: {color: '#E6ECE8', fontSize: 22, fontWeight: '800'},
  buttonLabelDown: {color: '#FFFFFF'},
});

export default CoverScreenView;
