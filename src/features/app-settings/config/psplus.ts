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
  {
    name: 'psplus_datacenter',
    type: 'radio',
    title: t('PsPlusDatacenterTitle'),
    description: t('PsPlusDatacenterDesc'),
    // Populated at runtime from settings.psplus_datacenter_pings (measured
    // across prior connection attempts, since there's no way to list
    // datacenters before one) -- see SettingsView.tsx, same pattern as
    // GFN's own region picker.
    data: [],
  },
];

export default psplus;
