import { type Scheme, scheme } from './scheme'

export { scheme } from './scheme'

/**
 * Clean & bright: neutral surfaces, white cards, big clear numbers and two team colours that stay
 * distinguishable for colour-blind players (amber vs blue). Light and dark share the same keys;
 * the palette is picked once at startup (see scheme.ts).
 */
const light = {
  bg: '#F2F3F7',
  surface: '#FFFFFF',
  raised: '#F5F6F9',
  sunken: '#ECEEF2',
  line: '#E4E6EB',
  lineStrong: '#CDD1D9',

  ink: '#14161B',
  inkMuted: '#5C6270',
  inkFaint: '#8C92A0',
  primary: '#14161B',
  onPrimary: '#FFFFFF',

  teamA: '#D97706',
  teamASoft: 'rgba(217, 119, 6, 0.12)',
  teamB: '#2563EB',
  teamBSoft: 'rgba(37, 99, 235, 0.10)',

  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.10)',
  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.10)',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.12)',
  ghost: '#7C5CC4',
  ghostSoft: 'rgba(124, 92, 196, 0.10)',
  scrim: 'rgba(20, 22, 27, 0.45)',
}

const dark: typeof light = {
  bg: '#0F1115',
  surface: '#181B21',
  raised: '#21252D',
  sunken: '#0B0D10',
  line: '#2A2E37',
  lineStrong: '#3B414C',

  ink: '#F4F5F7',
  inkMuted: '#A4A9B5',
  inkFaint: '#6E7482',
  primary: '#F4F5F7',
  onPrimary: '#0F1115',

  teamA: '#F5B03E',
  teamASoft: 'rgba(245, 176, 62, 0.14)',
  teamB: '#5AB4F0',
  teamBSoft: 'rgba(90, 180, 240, 0.14)',

  danger: '#F2555A',
  dangerSoft: 'rgba(242, 85, 90, 0.14)',
  success: '#3DD68C',
  successSoft: 'rgba(61, 214, 140, 0.14)',
  warning: '#F5A524',
  warningSoft: 'rgba(245, 165, 36, 0.14)',
  ghost: '#B4A7D6',
  ghostSoft: 'rgba(180, 167, 214, 0.14)',
  scrim: 'rgba(0, 0, 0, 0.6)',
}

export const palettes: Readonly<Record<Scheme, typeof light>> = { light, dark }

export const color = palettes[scheme]

export type Team = 'A' | 'B'
export const teamColor = (team: Team): string => (team === 'A' ? color.teamA : color.teamB)
export const teamSoft = (team: Team): string => (team === 'A' ? color.teamASoft : color.teamBSoft)

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const

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
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 30 },
  display: { fontFamily: font.bold, fontSize: 32, lineHeight: 42 },
  scoreSm: { fontFamily: font.scoreMedium, fontSize: 28, lineHeight: 32 },
  score: { fontFamily: font.score, fontSize: 44, lineHeight: 48 },
  scoreXl: { fontFamily: font.score, fontSize: 72, lineHeight: 76 },
} as const

/** Soft shadows on light surfaces; deeper ones where dark cards need separating from the background. */
export const elevation =
  scheme === 'light'
    ? ({
        card: { shadowColor: '#1B2030', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
        sheet: { shadowColor: '#1B2030', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
      } as const)
    : ({
        card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
        sheet: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
      } as const)

/** Minimum touch target; the live screen is used one-handed at a card table. */
export const HIT = 48
