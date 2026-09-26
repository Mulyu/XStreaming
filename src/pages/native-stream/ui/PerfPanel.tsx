import React from 'react';
import {StyleSheet, View, NativeModules} from 'react-native';
import {Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings} from '../../../shared/lib/settings';
import {getXcloudRegionFlag} from '../../../features/app-settings';

const {BatteryModule} = NativeModules;

type Props = {
  performance: any;
  streamType?: string;
};

const PerfPanel: React.FC<Props> = ({performance = {}, streamType}) => {
  const {t} = useTranslation();
  const settings = getSettings();
  const [battery, setBattery] = React.useState(100);
  const batteryInterval = React.useRef<any>(null);

  const xcloudRegionFlag =
    streamType === 'cloud' ? getXcloudRegionFlag(settings.force_region_ip) : '';
  const rttLabel = `${t('RTT')}${
    xcloudRegionFlag ? `(${xcloudRegionFlag})` : ''
  }${
    streamType === 'gfn' && performance.region ? `(${performance.region})` : ''
  }${
    streamType === 'gfn' && performance.transport
      ? `[${performance.transport}]`
      : ''
  }`;

  React.useEffect(() => {
    const getBattery = () => {
      BatteryModule.getBatteryLevel()
        .then((level: any) => {
          if (level) {
            setBattery(Number(level));
          } else {
            setBattery(-1);
          }
        })
        .catch((e: any) => {
          console.log(e);
        });
    };
    getBattery();

    // Catch battery every 2 mins
    batteryInterval.current = setInterval(getBattery, 2 * 60 * 1000);

    return () => {
      batteryInterval.current && clearInterval(batteryInterval.current);
    };
  }, []);

  const renderBattery = (level: number) => {
    if (level < 20) {
      return `🪫: ${level}%`;
    } else {
      return `🔋: ${level}%`;
    }
  };

  let resolutionText = '';
  if (performance.resolution) {
    resolutionText = performance.resolution;
    if (settings.resolution === 1081) {
      if (settings.fsr) {
        resolutionText = resolutionText + '(HQ + FSR)';
      } else {
        resolutionText = resolutionText + '(HQ)';
      }
    } else {
      if (settings.fsr) {
        resolutionText = resolutionText + '(FSR)';
      }
    }
  }

  return (
    <View style={styles.containerH}>
      <View style={styles.wrapperH}>
        <View>
          <Text style={styles.text}>{resolutionText || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {rttLabel}: {performance.rtt || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('JIT')}: {performance.jit || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FPS')}: {performance.fps || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FD')}: {performance.fl || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('PL')}: {performance.pl || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('Bitrate')}: {performance.br || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('DT')}: {performance.decode || '-1'}
            {' | '}
          </Text>
        </View>
        {!!performance.decoder && (
          <View>
            <Text style={styles.text}>
              {t('DEC')}: {performance.decoder}
              {' | '}
            </Text>
          </View>
        )}
        {!!(performance.wifi?.band || performance.wifi?.rssi) && (
          <View>
            <Text style={styles.text}>
              {t('WiFi')}: {performance.wifi?.band || '?'}
              {typeof performance.wifi?.rssi === 'number'
                ? ` ${performance.wifi.rssi}dBm`
                : ''}
              {' | '}
            </Text>
          </View>
        )}
        {battery > -1 && (
          <View>
            <Text style={styles.text}>{renderBattery(battery)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  containerH: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    zIndex: 5,
  },
  wrapperH: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 2,
    flexDirection: 'row',
  },
  text: {
    fontSize: 10,
    color: '#fff',
  },
});

export default PerfPanel;
