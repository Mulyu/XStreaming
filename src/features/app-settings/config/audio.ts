import i18next from '../../../i18n';

const {t} = i18next;

const audio = [
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
