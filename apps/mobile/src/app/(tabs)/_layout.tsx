import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router/js-tabs'
import type { ColorValue } from 'react-native'
import { useTranslation } from 'react-i18next'
import { color, font } from '@/theme/tokens'

type IconName = keyof typeof Ionicons.glyphMap

const icon = (name: IconName, active: IconName) =>
  function TabIcon({ focused, color: tint, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? active : name} color={typeof tint === 'string' ? tint : undefined} size={size} />
  }

export default function TabsLayout() {
  const { t } = useTranslation()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.inkFaint,
        tabBarStyle: { backgroundColor: color.bg, borderTopColor: color.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: color.bg },
      }}>
      {/* The Play home keeps the /club address so existing links and pushes still land. */}
      <Tabs.Screen name="club" options={{ title: t('tabs.play'), tabBarIcon: icon('play-circle-outline', 'play-circle') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen name="players" options={{ title: t('tabs.players'), tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="tournaments" options={{ title: t('tabs.tournaments'), tabBarIcon: icon('trophy-outline', 'trophy') }} />
    </Tabs>
  )
}
