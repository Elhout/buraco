import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ErrorText, Field, Row, Segmented, Sheet, Stack, Text } from '@/components/ui'
import { color } from '@/theme/tokens'
import type { MatchResultValue, MatchView } from '../types'
import { PAIR_JOINER, type UnitIndex } from '../units'

export interface EditResultInput {
  readonly matchId: string
  readonly result: MatchResultValue
  readonly pointsA: number
  readonly pointsB: number
  readonly reason: string
}

export interface EditResultSheetProps {
  match: MatchView
  index: UnitIndex
  allowDraw: boolean
  busy: boolean
  error: unknown
  onClose: () => void
  onSave: (input: EditResultInput) => void
}

const INT = /^-?\d{1,5}$/

function initialResult(m: MatchView, allowDraw: boolean): MatchResultValue {
  if (m.result !== null && (allowDraw || m.result !== 'draw')) return m.result
  if (m.liveA === m.liveB && allowDraw) return 'draw'
  return m.liveB > m.liveA ? 'b' : 'a'
}

/** Organizer correction or entry of a result; a reason is required and logged. Mount with key={matchId}. */
export function EditResultSheet({ match, index, allowDraw, busy, error, onClose, onSave }: EditResultSheetProps) {
  const { t } = useTranslation('tournament')
  const decided = match.result !== null
  const [result, setResult] = useState<MatchResultValue>(() => initialResult(match, allowDraw))
  const [pointsA, setPointsA] = useState(String(decided ? (match.pointsA ?? 0) : match.liveA))
  const [pointsB, setPointsB] = useState(String(decided ? (match.pointsB ?? 0) : match.liveB))
  const [reason, setReason] = useState('')
  const pointsOk = INT.test(pointsA.trim()) && INT.test(pointsB.trim())
  const canSave = pointsOk && reason.trim() !== ''
  const options = [
    { value: 'a' as const, label: 'A' },
    ...(allowDraw ? [{ value: 'draw' as const, label: t('edit.draw') }] : []),
    { value: 'b' as const, label: 'B' },
  ]

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={busy}
      title={t('edit.title')}
      subtitle={t('edit.subtitle', { round: match.roundNo, table: match.tableNo })}>
      <Stack gap={4}>
        <Text variant="label" tone={color.teamA}>
          A · {match.teamA.map(index.entryName).join(PAIR_JOINER)}
        </Text>
        <Text variant="label" tone={color.teamB}>
          B · {match.teamB.map(index.entryName).join(PAIR_JOINER)}
        </Text>
      </Stack>
      <Stack gap={8}>
        <Text variant="label" tone={color.inkMuted}>
          {t('edit.result')}
        </Text>
        <Segmented value={result} options={options} onChange={setResult} />
      </Stack>
      <Row gap={12}>
        <Stack gap={0} style={{ flex: 1 }}>
          <Field label={t('edit.pointsA')} value={pointsA} onChangeText={setPointsA} keyboardType="numbers-and-punctuation" maxLength={6} />
        </Stack>
        <Stack gap={0} style={{ flex: 1 }}>
          <Field label={t('edit.pointsB')} value={pointsB} onChangeText={setPointsB} keyboardType="numbers-and-punctuation" maxLength={6} />
        </Stack>
      </Row>
      {!pointsOk ? (
        <Text variant="caption" tone={color.danger}>
          {t('edit.pointsInvalid')}
        </Text>
      ) : null}
      <Field label={t('edit.reason')} value={reason} onChangeText={setReason} placeholder={t('edit.reasonPlaceholder')} maxLength={200} />
      <Banner tone="warning">{t('edit.consequence')}</Banner>
      <ErrorText error={error} />
      <Button
        size="lg"
        block
        loading={busy}
        disabled={!canSave}
        label={t('edit.save')}
        onPress={() =>
          onSave({
            matchId: match.matchId,
            result,
            pointsA: Number.parseInt(pointsA, 10),
            pointsB: Number.parseInt(pointsB, 10),
            reason: reason.trim(),
          })
        }
      />
    </Sheet>
  )
}
