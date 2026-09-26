import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Button, RadioButton, Text, Divider} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import type {Ds5SettingsViewModel} from '../model/useDs5Settings';

type Props = Ds5SettingsViewModel;

const Ds5SettingsView: React.FC<Props> = ({
  t,
  primaryColor,
  mode,
  startPos,
  endPos,
  force,
  frequency,
  title,
  description,
  onSetMode,
  onStartPosChange,
  onEndPosChange,
  onForceChange,
  onFrequencyChange,
  onSave,
  onBack,
}) => {
  const renderOptions = () => {
    return (
      <>
        <View>
          <RadioButton.Group onValueChange={onSetMode} value={mode}>
            <RadioButton.Item label={t('Off')} value="0" />
            <RadioButton.Item label={t('Resistance')} value="1" />
            <RadioButton.Item label={t('Trigger')} value="2" />
            <RadioButton.Item label={t('Automatic Trigger')} value="3" />
          </RadioButton.Group>
        </View>

        {mode > 0 ? (
          <View>
            <Text style={styles.sliderTitle}>start_pos</Text>
            <Slider
              style={styles.slider}
              value={startPos}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={onStartPosChange}
              lowerLimit={0}
              minimumTrackTintColor={primaryColor}
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {+mode === 2 ? (
          <View>
            <Text style={styles.sliderTitle}>end_pos</Text>
            <Slider
              style={styles.slider}
              value={endPos}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={onEndPosChange}
              lowerLimit={0}
              minimumTrackTintColor={primaryColor}
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {mode > 0 ? (
          <View>
            <Text style={styles.sliderTitle}>force</Text>
            <Slider
              style={styles.slider}
              value={force}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={onForceChange}
              lowerLimit={0}
              minimumTrackTintColor={primaryColor}
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {+mode === 3 ? (
          <View>
            <Text style={styles.sliderTitle}>frequency</Text>
            <Slider
              style={styles.slider}
              value={frequency}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={onFrequencyChange}
              lowerLimit={0}
              minimumTrackTintColor={primaryColor}
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.tips}>
          <Text>{title}</Text>
        </View>

        <View style={styles.tips}>
          <Text>Tips: {description}</Text>
        </View>

        <Divider />

        {renderOptions()}
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="contained" style={styles.button} onPress={onSave}>
          {t('Save')}
        </Button>
        <Button mode="outlined" style={styles.button} onPress={onBack}>
          {t('Back')}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tips: {
    padding: 10,
  },
  scrollView: {
    marginBottom: 120,
  },
  sliderTitle: {
    padding: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 20,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default Ds5SettingsView;
