// The only place colours are defined. Everything else in src/ refers to a
// token from here; `node scripts/check-palette.js` fails on any colour literal
// (hex, rgb()/rgba(), CSS colour name) outside this file.
//
// Base: Tokyo Night. Roles follow the design mock ("案4"): a dark blue-black
// ground, one cool accent, and separate semantic colours for sale / success /
// warning so the accent is never asked to mean "good" or "bad".

export const palette = {
  // Surfaces, darkest to lightest.
  bg: '#16161E',
  surface: '#1A1B26',
  surfaceHigh: '#24283B',
  outline: '#33385A',
  // Raised surfaces (cards, dialogs, menus), lowest to highest.
  elevation: {
    l1: '#1A1B26',
    l2: '#1E2030',
    l3: '#24283B',
    l4: '#272C42',
    l5: '#2B3048',
  },

  // Text. textDim is for hints and disabled labels only (>= 3:1 on surface).
  text: '#C0CAF5',
  textSoft: '#9AA5CE',
  textDim: '#6C7597',

  // The one brand accent, the text on top of it, and the TV focus ring.
  accent: '#7AA2F7',
  onAccent: '#12172B',
  accentContainer: '#2A3C6E',
  onAccentContainer: '#D6E2FF',
  focusRing: '#B4C9FA',

  // Meaning, independent of the accent.
  sale: '#F7768E',
  onSale: '#1F0A10',
  danger: '#F7768E',
  success: '#9ECE6A',
  warning: '#E0AF68',
  info: '#7DCFFF',

  // Overlays over video / images and plain extremes.
  scrim: '#0B0B10',
  white: '#FFFFFF',
  black: '#000000',

  // Service identity colours. These tell Xbox / GeForce NOW / PlayStation
  // apart; they are not the app accent.
  provider: {
    xbox: '#3FBF3F',
    gfn: '#76B900',
    gfnBright: '#A7E04A',
    ps: '#3C9BF0',
    psBright: '#7DB8F7',
  },

  // Controller artwork: face-button and macro-button colours, and the greys of
  // the button legend icons. Fixed because they depict a physical pad.
  pad: {
    a: '#7DB700',
    b: '#EF4E29',
    x: '#009FEB',
    y: '#FEB504',
    legendA: '#A0D468',
    legendB: '#ED5564',
    legendX: '#5D9CEC',
    legendY: '#FFCE54',
    macro1: '#2E7D32',
    macro1Down: '#235E26',
    macro2: '#1565C0',
    macro2Down: '#104C90',
    macro3: '#EF6C00',
    macro3Down: '#B35100',
    ink: '#333333',
    paper: '#FFFFFF',
    silver: '#AAB2BC',
    light: '#CCD1D9',
    steel: '#656D78',
    iron: '#434A54',
  },
} as const;

/** `hex` ("#RRGGBB") at the given opacity, as an rgba() string. */
export const alpha = (hex: string, opacity: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
};
