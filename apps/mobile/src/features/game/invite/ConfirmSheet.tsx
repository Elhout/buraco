import { useMutation } from '@tanstack/react-query'
import { StyleSheet, View } from 'react-native'
import { Button, ErrorText, Sheet } from '@/components/ui'
import { space } from '@/theme/tokens'

export interface ConfirmSheetProps {
  visible: boolean
  onClose: () => void
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  /** Destructive actions use the danger button. */
  danger?: boolean
  action: () => Promise<unknown>
  onDone?: () => void
}

/** A yes/no sheet for consequential invite actions (decline, ghost, cancel). Locked while the RPC runs. */
export function ConfirmSheet({ visible, onClose, title, body, confirmLabel, cancelLabel, danger, action, onDone }: ConfirmSheetProps) {
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: () => {
      onClose()
      onDone?.()
    },
  })
  const close = (): void => {
    mutation.reset()
    onClose()
  }
  return (
    <Sheet visible={visible} onClose={close} title={title} subtitle={body} locked={mutation.isPending}>
      <View style={styles.actions}>
        <ErrorText error={mutation.error} />
        <Button
          label={confirmLabel}
          variant={danger ? 'danger' : 'primary'}
          size="lg"
          block
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
        <Button label={cancelLabel} variant="quiet" block disabled={mutation.isPending} onPress={close} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  actions: { gap: space.sm },
})
