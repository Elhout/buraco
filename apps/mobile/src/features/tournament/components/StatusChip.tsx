import { useTranslation } from 'react-i18next'
import { color } from '@/theme/tokens'
import type { TournamentStatus } from '../types'
import { Chip } from './Chip'

const TONE: Record<TournamentStatus, string> = {
  draft: color.inkMuted,
  running: color.success,
  finished: color.ivory,
  cancelled: color.danger,
}

export function StatusChip({ status }: { status: TournamentStatus }) {
  const { t } = useTranslation('tournament')
  return <Chip label={t(`status.${status}`)} tone={TONE[status]} />
}
