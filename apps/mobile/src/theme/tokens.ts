/**
 * "Card table" direction: deep felt greens, ivory type, and two team colours that stay
 * distinguishable for colour-blind players (brass vs sky). Dark only: games happen in dim rooms.
 */
export const color = {
  felt: '#0B1410',
  surface: '#12201A',
  raised: '#1A2C24',
  sunken: '#08100C',
  line: '#24392F',
  lineStrong: '#36524A',

  ink: '#F3EBDD',
  inkMuted: '#A7B3A9',
  inkFaint: '#6E7D73',
  inkOnLight: '#0B1410',

  teamA: '#F2B33D',
  teamASoft: 'rgba(242, 179, 61, 0.14)',
  teamB: '#5AB4F0',
  teamBSoft: 'rgba(90, 180, 240, 0.14)',

  ivory: '#F3EBDD',
  danger: '#E5484D',
  dangerSoft: 'rgba(229, 72, 77, 0.14)',
  success: '#46A758',
  successSoft: 'rgba(70, 167, 88, 0.14)',
  warning: '#F5A524',
  ghost: '#B4A7D6',
  ghostSoft: 'rgba(180, 167, 214, 0.14)',
  scrim: 'rgba(4, 8, 6, 0.72)',
} as const

export type Team = 'A' | 'B'
export const teamColor = (team: Team): string => (team === 'A' ? color.teamA : color.teamB)
export const teamSoft = (team: Team): string => (team === 'A' ? color.teamASoft : color.teamBSoft)

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const

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

export const elevation = {
  card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  sheet: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
} as const

/** Minimum touch target; the live screen is used one-handed at a card table. */
export const HIT = 48
