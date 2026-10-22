import { type Scheme, scheme } from './scheme'

export { scheme } from './scheme'

/**
 * Felt & paper: a card table in a dim room. Dark is green-black felt with warm paper-white ink;
 * light is the paper itself. Surfaces are flat and separated by hairlines, not shadows. The two
 * team colours (terracotta vs ink blue) stay distinguishable for colour-blind players; brass is the
 * one accent and is used sparingly. Light and dark share the same keys; the palette is picked once
 * at startup (see scheme.ts).
 */
const light = {
  bg: '#F3EFE7',
  surface: '#FBF9F4',
  raised: '#ECE7DD',
  sunken: '#E7E1D5',
  line: '#E0D9CB',
  lineStrong: '#C9C0AE',

  ink: '#1B1E1C',
  inkMuted: '#5E625D',
  inkFaint: '#8E9089',
  primary: '#1B1E1C',
  onPrimary: '#FBF9F4',
  accent: '#9C7A35',

  teamA: '#C25A2C',
  teamASoft: 'rgba(194, 90, 44, 0.09)',
  teamB: '#2A5A8E',
  teamBSoft: 'rgba(42, 90, 142, 0.08)',

  danger: '#B0283A',
  dangerSoft: 'rgba(176, 40, 58, 0.08)',
  success: '#2F7350',
  successSoft: 'rgba(47, 115, 80, 0.09)',
  warning: '#9A6A14',
  warningSoft: 'rgba(154, 106, 20, 0.10)',
  ghost: '#685A92',
  ghostSoft: 'rgba(104, 90, 146, 0.09)',
  scrim: 'rgba(27, 30, 28, 0.40)',
}

const dark: typeof light = {
  bg: '#0E1412',
  surface: '#151C19',
  raised: '#1D2521',
  sunken: '#0A0F0D',
  line: '#232C28',
  lineStrong: '#34403A',

  ink: '#ECE7DC',
  inkMuted: '#99A099',
  inkFaint: '#646D67',
  primary: '#ECE7DC',
  onPrimary: '#0E1412',
  accent: '#C9A45C',

  teamA: '#E58A5C',
  teamASoft: 'rgba(229, 138, 92, 0.10)',
  teamB: '#7EAAD9',
  teamBSoft: 'rgba(126, 170, 217, 0.10)',

  danger: '#EC6F78',
  dangerSoft: 'rgba(236, 111, 120, 0.10)',
  success: '#74C392',
  successSoft: 'rgba(116, 195, 146, 0.10)',
  warning: '#D8AE5E',
  warningSoft: 'rgba(216, 174, 94, 0.11)',
  ghost: '#AFA3CF',
  ghostSoft: 'rgba(175, 163, 207, 0.10)',
  scrim: 'rgba(0, 0, 0, 0.62)',
}

export const palettes: Readonly<Record<Scheme, typeof light>> = { light, dark }

export const color = palettes[scheme]

export type Team = 'A' | 'B'
export const teamColor = (team: Team): string => (team === 'A' ? color.teamA : color.teamB)
export const teamSoft = (team: Team): string => (team === 'A' ? color.teamASoft : color.teamBSoft)

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 6, md: 10, lg: 14, sheet: 20, pill: 999 } as const

export const font = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
  score: 'BarlowCondensed_700Bold',
  scoreMedium: 'BarlowCondensed_600SemiBold',
} as const

/** Type scale. Live-game numbers use `score*` (spec: 40pt or larger). */
export const type = {
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  display: { fontFamily: font.semibold, fontSize: 30, lineHeight: 40, letterSpacing: -0.6 },
  scoreSm: { fontFamily: font.scoreMedium, fontSize: 28, lineHeight: 32 },
  score: { fontFamily: font.score, fontSize: 44, lineHeight: 48 },
  scoreXl: { fontFamily: font.score, fontSize: 72, lineHeight: 76 },
} as const

/**
 * Flat by design: cards sit on hairlines, not shadows. Only the bottom sheet lifts off the page,
 * and only a little.
 */
export const elevation = {
  card: {},
  sheet:
    scheme === 'light'
      ? { shadowColor: '#1B1E1C', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 8 }
      : { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
} as const

/** Minimum touch target; the live screen is used one-handed at a card table. */
export const HIT = 48
