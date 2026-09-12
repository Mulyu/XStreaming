import i18next from '../../i18n';

const {t} = i18next;

const audio = [
  {
    name: 'enable_audio_rumble',
    type: 'radio',
    title: t('Audio_rumble_title'),
    description: t('Audio_rumble_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'audio_rumble_threshold',
    type: 'slider',
    min: 10,
    max: 100,
    step: 1,
    title: t('Audio_rumble_threshold_title'),
    description: t('Audio_rumble_threshold_desc'),
    data: [],
  },
  {
    name: 'enable_microphone',
    type: 'radio',
    title: t('Microphone_title'),
    description: t('Microphone_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
];

export default audio;
