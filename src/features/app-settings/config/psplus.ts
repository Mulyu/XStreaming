import i18next from '../../../i18n';

const {t} = i18next;

const psplus = [
  {
    name: 'psplus_resolution',
    type: 'radio',
    title: t('PsPlusResolutionTitle'),
    description: t('PsPlusResolutionDesc'),
    // Matches VideoResolutionPreset in features/ps-plus-session/api/native.ts.
    data: [
      {value: 1, text: '360P'},
      {value: 2, text: '540P'},
      {value: 3, text: '720P'},
      {value: 4, text: '1080P'},
      {value: 5, text: '1440P'},
      {value: 6, text: '4K'},
    ],
  },
  {
    name: 'psplus_fps',
    type: 'radio',
    title: t('PsPlusFpsTitle'),
    description: t('PsPlusFpsDesc'),
    data: [
      {value: 30, text: '30 FPS'},
      {value: 60, text: '60 FPS'},
    ],
  },
  {
    name: 'psplus_bitrate_mode',
    type: 'radio',
    title: t('PsPlusBitrateTitle'),
    description: t('PsPlusBitrateDesc'),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'custom', text: t('Custom')},
    ],
  },
];

export default psplus;
