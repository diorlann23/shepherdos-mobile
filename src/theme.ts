import { Platform, useColorScheme, type ViewStyle } from 'react-native';

/**
 * ShepherdOS colours: the navy and gold of the emblem. Navy carries the app
 * (headers, buttons, the selected tab); gold marks what's new or important.
 */
const light = {
  background: '#F4F6FA',
  card: '#FFFFFF',
  muted: '#EDF1F7',
  border: '#E1E6EF',
  text: '#0D1B33',
  textMuted: '#5E6A80',
  primary: '#0B2A5B',
  primarySoft: '#E6ECF6',
  onPrimary: '#FFFFFF',
  /** Gold: badges, highlights and the selected-tab dot. Too light for text on white: use accentText. */
  accent: '#DC9E2A',
  accentSoft: '#FBF0D9',
  accentText: '#8A5A06',
  onAccent: '#1F1503',
  /** The navy band at the top of every screen. */
  header: '#0B2A5B',
  headerText: '#FFFFFF',
  headerMuted: 'rgba(255,255,255,0.72)',
  headerSoft: 'rgba(255,255,255,0.12)',
  success: '#15925F',
  successSoft: '#E3F5EC',
  warning: '#B7791F',
  warningSoft: '#FCF3DD',
  danger: '#DC2F2F',
  dangerSoft: '#FCE9E8',
  shadow: '#0B2A5B',
};
export type Palette = typeof light;

const dark: Palette = {
  background: '#0A1120',
  card: '#121B2E',
  muted: '#1A2439',
  border: '#25304A',
  text: '#ECF1FA',
  textMuted: '#97A3BA',
  primary: '#8CAEEB',
  primarySoft: '#1B2946',
  onPrimary: '#0A1120',
  accent: '#E6AE45',
  accentSoft: '#3A2C12',
  accentText: '#F0C46E',
  onAccent: '#1F1503',
  header: '#0E2346',
  headerText: '#FFFFFF',
  headerMuted: 'rgba(255,255,255,0.7)',
  headerSoft: 'rgba(255,255,255,0.1)',
  success: '#3CC48A',
  successSoft: '#173326',
  warning: '#E5B04B',
  warningSoft: '#3A2E14',
  danger: '#F2675F',
  dangerSoft: '#3D1C1B',
  shadow: '#000000',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 18, xl: 28, pill: 999 } as const;
export const font = { title: 28, heading: 20, body: 16, small: 14, tiny: 12 } as const;

/** A soft lift for cards on light backgrounds; dark mode relies on the border instead. */
export function elevation(colors: Palette, dark: boolean, level: 1 | 2 = 1): ViewStyle {
  if (dark) return {};
  return Platform.select<ViewStyle>({
    android: { elevation: level * 2, shadowColor: colors.shadow },
    default: { shadowColor: colors.shadow, shadowOpacity: level === 1 ? 0.06 : 0.12, shadowRadius: level === 1 ? 12 : 20, shadowOffset: { width: 0, height: level === 1 ? 4 : 8 } },
  });
}

export function useTheme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? dark : light, dark: scheme === 'dark' };
}
