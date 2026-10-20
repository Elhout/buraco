import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { AppState, Platform } from 'react-native'
import { rpc } from './rpc'

let currentToken: string | null = null
let activeGameId: string | null = null

/** Foreground pushes about the game already on screen are hidden: the in-app sheet is enough. */
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const url = n.request.content.data?.url
    const aboutOpenGame = typeof url === 'string' && activeGameId !== null && url.includes(activeGameId)
    return { shouldShowBanner: !aboutOpenGame, shouldShowList: true, shouldPlaySound: !aboutOpenGame, shouldSetBadge: false }
  },
})

const platform = (): 'ios' | 'android' | 'web' => (Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web')

/** Asks permission, gets the Expo push token and registers it for the signed-in user. */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS === 'web') return null
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Buraco',
      // Exported via a nested `export *` the import plugin cannot follow; TypeScript resolves it.
      // eslint-disable-next-line import/namespace
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#F2B33D',
    })
  }
  const current = await Notifications.getPermissionsAsync()
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
  if (!granted) return null
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  if (!projectId) return null
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
  await rpc('register_device', { p_token: token, p_platform: platform() })
  currentToken = token
  return token
}

/** This phone's registered Expo push token, if any (e.g. to mark "this device" in Profile). */
export const currentPushToken = (): string | null => currentToken

/** Called on sign-out: this phone must stop receiving the previous user's pushes. */
export async function unregisterPush(): Promise<void> {
  if (!currentToken) return
  const token = currentToken
  currentToken = null
  await rpc('unregister_device', { p_token: token }).catch(() => undefined)
}

const syncDeviceState = (): void => {
  if (!currentToken) return
  void rpc('set_device_state', {
    p_token: currentToken,
    p_app_state: AppState.currentState === 'active' ? 'active' : 'background',
    p_active_game_id: activeGameId ?? undefined,
  }).catch(() => undefined)
}

/** The live game screen calls this so the server suppresses pushes about that game. */
export function setActiveGame(gameId: string | null): void {
  activeGameId = gameId
  syncDeviceState()
}

/** Opens the deep link of a tapped notification, including one that launched the app. */
export function startPushRouting(): () => void {
  const open = (n: Notifications.Notification): void => {
    const url = n.request.content.data?.url
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never)
  }
  void Notifications.getLastNotificationResponseAsync().then((r) => r && open(r.notification))
  const tapped = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification))
  const appState = AppState.addEventListener('change', syncDeviceState)
  return () => {
    tapped.remove()
    appState.remove()
  }
}

/** Web Push states (push.web.ts); phones always use native push. */
export type WebPushState = 'unsupported' | 'needsInstall' | 'default' | 'granted' | 'denied'
export const webPushState = (): WebPushState => 'unsupported'
export const enableWebPush = async (): Promise<WebPushState> => 'unsupported'
