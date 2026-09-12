import i18next from '../../i18n';

const {t} = i18next;

const gfn = [
  {
    name: 'gfn_resolution',
    type: 'radio',
    title: t('GfnResolutionTitle'),
    description: t('GfnResolutionDesc'),
    data: [
      {value: '1280x720', text: '720P'},
      {value: '1920x1080', text: '1080P'},
      {value: '2560x1440', text: '1440P'},
    ],
  },
  {
    name: 'gfn_fps',
    type: 'radio',
    title: t('GfnFpsTitle'),
    description: t('GfnFpsDesc'),
    data: [
      {value: 30, text: '30 FPS'},
      {value: 60, text: '60 FPS'},
    ],
  },
  {
    name: 'gfn_bitrate_mode',
    type: 'radio',
    title: t('GfnBitrateTitle'),
    description: t('GfnBitrateDesc'),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'custom', text: t('Custom')},
    ],
  },
  {
    name: 'gfn_region',
    type: 'radio',
    title: t('GfnRegionTitle'),
    description: t('GfnRegionDesc'),
    // Populated at runtime from fetchGfnRegions() -- see SettingDetail.tsx,
    // same pattern as xCloud's own 'signaling_cloud' region picker.
    data: [],
  },
];

export default gfn;
