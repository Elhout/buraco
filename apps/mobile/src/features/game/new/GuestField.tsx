import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Button, Field } from '@/components/ui'
import { color, space } from '@/theme/tokens'
import { GUEST_NAME_MAX, type Player, type Slots, guestFrom, nextFreeSeat } from './draft'

/** Ghost mode only: seat someone without an account by name. */
export function GuestField({ slots, onAdd }: { slots: Slots; onAdd: (guest: Player) => void }) {
  const { t } = useTranslation(['lobby', 'common'])
  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState(false)
  const full = nextFreeSeat(slots) === null

  const add = (): void => {
    const guest = guestFrom(name, slots)
    if (!guest) {
      setInvalid(true)
      return
    }
    onAdd(guest)
    setName('')
    setInvalid(false)
  }

  return (
    <View style={styles.wrap}>
      <Field
        label={t('new.guest')}
        placeholder={t('new.guestPlaceholder')}
        value={name}
        onChangeText={(v) => {
          setName(v)
          setInvalid(false)
        }}
        maxLength={GUEST_NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={add}
        editable={!full}
        error={invalid ? t('new.guestInvalid') : null}
        hint={full ? t('new.full') : t('new.guestHint')}
      />
      <Button
        label={t('new.guestAdd')}
        variant="secondary"
        disabled={full || name.trim() === ''}
        onPress={add}
        icon={<Ionicons name="person-add-outline" size={18} color={color.ink} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, alignItems: 'stretch' },
})
