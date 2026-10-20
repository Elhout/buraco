import { Screen } from './ui/Screen'
import { Text } from './ui/Text'

/** Temporary screen body used while a feature is being built. */
export function Placeholder({ name }: { name: string }) {
  return (
    <Screen title={name}>
      <Text>{name}</Text>
    </Screen>
  )
}
