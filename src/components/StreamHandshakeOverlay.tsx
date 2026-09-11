import React from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {LoadingPhase} from '../utils/loadingPhase';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';

export interface StreamHandshakeOverlayProps {
  streamType?: string;
  gameTitle?: string;
  posterUrl?: string;
  phase: LoadingPhase;
  queuePosition?: number;
  // The existing raw connection-step text (e.g. "Ready to send ICE..."),
  // shown verbatim as the telemetry line -- nothing technical is dropped,
  // it just moves out of the headline and into this detail row.
  detailText: string;
  onCancel: () => void;
}

const PHASE_PCT: Record<LoadingPhase, number> = {
  queue: 15,
  handshake: 30,
  negotiating: 60,
  starting: 85,
  live: 100,
};

const PHASE_LABEL_KEY: Record<LoadingPhase, string> = {
  queue: 'LoadingPhaseQueue',
  handshake: 'LoadingPhaseHandshake',
  negotiating: 'LoadingPhaseNegotiating',
  starting: 'LoadingPhaseStarting',
  live: 'LoadingPhaseLive',
};

const PHASE_SUB_KEY: Partial<Record<LoadingPhase, string>> = {
  handshake: 'LoadingPhaseHandshakeSub',
  negotiating: 'LoadingPhaseNegotiatingSub',
  starting: 'LoadingPhaseStartingSub',
};

const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// A slow, endless ambient drift for one glow blob in the no-poster ("field")
// backdrop -- pure Animated/transform (no blur/SVG needed), so it stays cheap
// running next to an active WebRTC decode.
const GlowBlob: React.FC<{
  color: string;
  size: number;
  durationMs: number;
  positionStyle: any;
}> = ({color, size, durationMs, positionStyle}) => {
  const drift = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, durationMs]);

  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, size * 0.18],
  });
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -size * 0.14],
  });
  const scale = drift.interpolate({inputRange: [0, 1], outputRange: [1, 1.12]});

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        positionStyle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{translateX}, {translateY}, {scale}],
        },
      ]}
    />
  );
};

// Stands in for box art when none was passed (GFN launches never carry a
// poster today) -- a quiet, provider-tinted glow instead of a flat black
// screen, so a GFN connect doesn't read as "Xbox, but broken".
const FieldBackdrop: React.FC<{accent: string}> = ({accent}) => (
  <View
    style={[StyleSheet.absoluteFill, styles.fieldBase]}
    pointerEvents="none">
    <GlowBlob
      color={withAlpha(accent, 0.16)}
      size={340}
      durationMs={9000}
      positionStyle={styles.fieldBlobTopLeft}
    />
    <GlowBlob
      color={withAlpha(accent, 0.1)}
      size={260}
      durationMs={11000}
      positionStyle={styles.fieldBlobBottomRight}
    />
  </View>
);

const StreamHandshakeOverlay: React.FC<StreamHandshakeOverlayProps> = ({
  streamType,
  gameTitle,
  posterUrl,
  phase,
  queuePosition,
  detailText,
  onCancel,
}) => {
  const {t} = useTranslation();
  const isGfn = streamType === 'gfn';
  const accent = isGfn ? NVIDIA_ACCENT : XBOX_ACCENT;
  const badgeLetter = isGfn ? 'N' : 'X';
  const providerLabel = isGfn
    ? 'GeForce Now'
    : streamType === 'home'
    ? 'Xbox Console'
    : 'Xbox Cloud Gaming';
  const isLive = phase === 'live';

  const kenBurns = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!posterUrl) {
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(kenBurns, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(kenBurns, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [kenBurns, posterUrl]);
  const backdropScale = kenBurns.interpolate({
    inputRange: [0, 1],
    outputRange: [1.04, 1.14],
  });

  const subKey = PHASE_SUB_KEY[phase];
  const sub =
    phase === 'queue'
      ? queuePosition
        ? t('LoadingPhaseQueueSub', {n: queuePosition})
        : ''
      : subKey
      ? t(subKey)
      : '';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {posterUrl ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {transform: [{scale: backdropScale}]},
          ]}
          pointerEvents="none">
          <Image
            source={{uri: posterUrl}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={10}
          />
        </Animated.View>
      ) : (
        <FieldBackdrop accent={accent} />
      )}
      {!!posterUrl && (
        <Image
          source={{uri: posterUrl}}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          pointerEvents="none"
        />
      )}
      <View style={styles.scrimTop} pointerEvents="none" />
      <View style={styles.scrimBottom} pointerEvents="none" />

      <View style={styles.topBar}>
        <View style={styles.chip}>
          <View style={[styles.chipBadge, {backgroundColor: accent}]}>
            <Text style={styles.chipBadgeText}>{badgeLetter}</Text>
          </View>
          <Text style={styles.chipLabel}>{providerLabel}</Text>
        </View>
        <Pressable
          style={styles.cancelBtn}
          onPress={onCancel}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={styles.cancelText}>{`✕ ${t('Cancel')}`}</Text>
        </Pressable>
      </View>

      <View style={styles.hud} pointerEvents="none">
        {!!gameTitle && (
          <Text style={styles.gameTitle} numberOfLines={1}>
            {gameTitle}
          </Text>
        )}
        <View style={styles.rail}>
          <View
            style={[
              styles.railFill,
              {width: `${PHASE_PCT[phase]}%`, backgroundColor: accent},
            ]}
          />
        </View>
        <Text style={[styles.phaseLabel, isLive && {color: accent}]}>
          {t(PHASE_LABEL_KEY[phase])}
        </Text>
        {!!sub && <Text style={styles.phaseSub}>{sub}</Text>}
        <View style={styles.telemetryRow}>
          <View
            style={[styles.telemetryDot, isLive && {backgroundColor: accent}]}
          />
          <Text style={styles.telemetryText} numberOfLines={1}>
            {detailText}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fieldBase: {
    backgroundColor: '#0a0f0c',
    overflow: 'hidden',
  },
  fieldBlobTopLeft: {position: 'absolute', top: -80, left: -60},
  fieldBlobBottomRight: {position: 'absolute', bottom: -60, right: -40},
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(6,8,7,0.55)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: 'rgba(6,8,7,0.85)',
  },
  topBar: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(10,14,12,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.14)',
  },
  chipBadge: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: {fontSize: 9.5, fontWeight: '800', color: '#08130a'},
  chipLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#eef4ef',
    textTransform: 'uppercase',
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(10,14,12,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.14)',
  },
  cancelText: {fontSize: 11, fontWeight: '600', color: '#89998e'},
  hud: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
  },
  gameTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#eef4ef',
    marginBottom: 10,
  },
  rail: {
    height: 3,
    backgroundColor: 'rgba(238,244,239,0.16)',
    marginBottom: 8,
  },
  railFill: {height: '100%'},
  phaseLabel: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#eef4ef',
    textTransform: 'uppercase',
  },
  phaseSub: {fontSize: 12, color: '#89998e', marginTop: 2},
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(238,244,239,0.14)',
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#89998e',
  },
  telemetryText: {flex: 1, fontSize: 11, color: '#89998e'},
});

export default StreamHandshakeOverlay;
