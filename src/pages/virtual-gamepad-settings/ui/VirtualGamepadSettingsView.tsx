import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {
  Button,
  RadioButton,
  Text,
  Portal,
  Modal,
  Card,
  HelperText,
  TextInput,
} from 'react-native-paper';
import type {VirtualGamepadSettingsViewModel} from '../model/useVirtualGamepadSettings';

type Props = VirtualGamepadSettingsViewModel;

const VirtualGamepadSettingsView: React.FC<Props> = ({
  t,
  value,
  name,
  settings,
  showAddModal,
  isError,
  errorText,
  heroCardStyle,
  heroDescStyle,
  heroHintStyle,
  onChangeName,
  onSelectValue,
  onSave,
  onEdit,
  onBack,
  onDismissAddModal,
  onConfirmAddModal,
}) => {
  return (
    <View style={styles.container}>
      <Portal>
        <Modal
          visible={showAddModal}
          onDismiss={onDismissAddModal}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <TextInput label="" value={name} onChangeText={onChangeName} />
              <HelperText type="error" visible={isError}>
                {errorText}
              </HelperText>

              <Button
                mode="contained"
                style={{marginTop: 20}}
                onPress={onConfirmAddModal}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <ScrollView style={styles.scrollView}>
        <Card style={[styles.heroCard, ...heroCardStyle]}>
          <Card.Content>
            <Text style={[styles.heroDesc, ...heroDescStyle]}>
              {t('Customize buttons of virtual gamepad')}
            </Text>
            <Text style={[styles.heroHint, ...heroHintStyle]}>
              {t(
                'The position of custom virtual buttons may have discrepancies with actual rendering. Please refer to the actual effect for accuracy',
              )}
            </Text>
          </Card.Content>
        </Card>

        <RadioButton.Group onValueChange={onSelectValue} value={value}>
          <RadioButton.Item label={t('Default')} value={''} />
          {settings.map(s => {
            return <RadioButton.Item key={s} label={s} value={s} />;
          })}
        </RadioButton.Group>
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="elevated" style={styles.button} onPress={onSave}>
          {t('Select')}
        </Button>
        {value !== '' && (
          <Button mode="outlined" style={styles.button} onPress={onEdit}>
            {t('Edit')}
          </Button>
        )}
        <Button mode="text" style={styles.button} onPress={onBack}>
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
  heroCard: {
    margin: 12,
    backgroundColor: '#16351c',
  },
  heroDesc: {
    color: '#C0D8BF',
    lineHeight: 20,
  },
  heroHint: {
    color: '#a5c6a3',
    marginTop: 8,
    lineHeight: 18,
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
  modal: {
    marginLeft: '10%',
    marginRight: '10%',
  },
});

export default VirtualGamepadSettingsView;
