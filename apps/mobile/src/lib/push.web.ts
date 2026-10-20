import { router } from 'expo-router'
import { AppState } from 'react-native'
import { env } from './env'
import { rpc } from './rpc'

/**
 * Web Push for the web build (iPhone players use it as a home-screen app). Same exports as
 * push.ts. iOS only allows web push for an app added to the home screen (iOS 16.4+), and the
 * permission prompt must come from a tap, so enableWebPush is called from a button.
 */

export type WebPushState = 'unsupported' | 'needsInstall' | 'default' | 'granted' | 'denied'

let currentEndpoint: string | null = null
let activeGameId: string | null = null

const supported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const isIos = (): boolean => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

export function webPushState(): WebPushState {
  // On an iPhone, Safari tabs have no PushManager at all: the app must be on the home screen first.
  if (isIos() && !isStandalone()) return 'needsInstall'
  if (!supported() || !env?.vapidPublicKey) return 'unsupported'
  return Notification.permission
}

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function subscribe(): Promise<string | null> {
  const key = env?.vapidPublicKey
  if (!key) return null
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null
  await rpc('register_web_push', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth })
  currentEndpoint = json.endpoint
  return json.endpoint
}

/** Called after sign-in: re-registers silently when notifications were already allowed. */
export async function registerForPush(): Promise<string | null> {
  if (supported()) void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  if (webPushState() !== 'granted') return null
  return subscribe()
}

/** From a tap: asks permission (iOS shows its prompt only then) and subscribes this browser. */
export async function enableWebPush(): Promise<WebPushState> {
  if (webPushState() !== 'default') return webPushState()
  const permission = await Notification.requestPermission()
  if (permission === 'granted') await subscribe()
  return webPushState()
}

export const currentPushToken = (): string | null => currentEndpoint

export async function unregisterPush(): Promise<void> {
  if (!currentEndpoint) return
  const endpoint = currentEndpoint
  currentEndpoint = null
  await rpc('unregister_device', { p_token: endpoint }).catch(() => undefined)
}

const syncDeviceState = (): void => {
  if (!currentEndpoint) return
  void rpc('set_device_state', {
    p_token: currentEndpoint,
    p_app_state: AppState.currentState === 'active' ? 'active' : 'background',
    p_active_game_id: activeGameId ?? undefined,
  }).catch(() => undefined)
}

export function setActiveGame(gameId: string | null): void {
  activeGameId = gameId
  syncDeviceState()
}

/** The service worker posts {type:'navigate', url} when a notification is tapped while the app is open. */
export function startPushRouting(): () => void {
  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { type?: string; url?: string } | null
    if (data?.type === 'navigate' && typeof data.url === 'string' && data.url.startsWith('/')) router.push(data.url as never)
  }
  if (supported()) navigator.serviceWorker.addEventListener('message', onMessage)
  const appState = AppState.addEventListener('change', syncDeviceState)
  return () => {
    if (supported()) navigator.serviceWorker.removeEventListener('message', onMessage)
    appState.remove()
  }
}
