import { useColorScheme } from 'react-native';

/** ShepherdOS colours, matched to the website's light and dark themes. */
const light = {
  background: '#F8F9FC',
  card: '#FFFFFF',
  muted: '#F0F2F7',
  border: '#E4E6EE',
  text: '#151826',
  textMuted: '#646A7D',
  primary: '#4338CA',
  primarySoft: '#ECEBFB',
  onPrimary: '#FFFFFF',
  success: '#15925F',
  successSoft: '#E3F5EC',
  warning: '#B7791F',
  warningSoft: '#FCF3DD',
  danger: '#DC2F2F',
  dangerSoft: '#FCE9E8',
};
export type Palette = typeof light;

const dark: Palette = {
  background: '#12141C',
  card: '#1B1E28',
  muted: '#232734',
  border: '#2A2E3B',
  text: '#EEF0F6',
  textMuted: '#9AA0B3',
  primary: '#8B8CF5',
  primarySoft: '#26284A',
  onPrimary: '#12141C',
  success: '#3CC48A',
  successSoft: '#173326',
  warning: '#E5B04B',
  warningSoft: '#3A2E14',
  danger: '#F2675F',
  dangerSoft: '#3D1C1B',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { title: 28, heading: 20, body: 16, small: 14, tiny: 12 } as const;

export function useTheme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? dark : light, dark: scheme === 'dark' };
}
