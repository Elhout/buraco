import type { Team } from '@buraco/shared'
import { useTranslation } from 'react-i18next'
import { type QuickGame, teamName } from './model'

/** The team's name, or "Team A" / "Team B" when it has none (names are optional). */
export function useTeamLabel(game: QuickGame): (team: Team) => string {
  const { t } = useTranslation('quick')
  return (team) => teamName(game, team) || t('team', { team })
}
