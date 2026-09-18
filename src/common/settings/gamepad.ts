import i18next from '../../i18n';

const {t} = i18next;

const gamepad = [
  {
    name: 'maping',
    type: '',
    title: t('Key mapping'),
    description: t('Mapping key of gamepad'),
    data: [],
  },
  {
    name: 'polling_rate',
    type: 'radio',
    title: t('Polling rate'),
    description: t('Modify controller response rate'),
    data: [
      {value: 250, text: '250HZ'},
      {value: 83.33, text: '83.33HZ'},
      {value: 62.5, text: '62.5HZ'},
      {value: 50, text: '50HZ'},
      {value: 41.67, text: '41.67HZ'},
      {value: 35.71, text: '35.71HZ'},
      {value: 31.25, text: '31.25HZ'},
      {value: 27.78, text: '27.78HZ'},
      {value: 25, text: '25HZ'},
      {value: 22.73, text: '22.73HZ'},
      {value: 20.83, text: '20.83HZ'},
      {value: 19.23, text: '19.23HZ'},
      {value: 17.86, text: '17.86HZ'},
      {value: 16.67, text: '16.67HZ'},
    ],
  },
  {
    name: 'dead_zone',
    type: 'slider',
    min: 0,
    max: 0.9,
    step: 0.01,
    title: t('Joystick dead zone'),
    description: t('Config joystick dead zone'),
    data: [],
  },
];

export default gamepad;
