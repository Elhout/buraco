import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui'
import { HIT, color, radius, space } from '@/theme/tokens'
import { uploadVoiceNote, voiceNoteUrl } from './voice'
import { MAX_VOICE_SECONDS, formatClock, voiceSeconds } from './voiceFormat'

/** Mic button; while recording, a timer with Cancel and Send. Sends the uploaded note to `onSend`. */
export function VoiceRecorder({
  gameId,
  onSend,
  disabled,
  onRecordingChange,
}: {
  gameId: string
  onSend: (note: { path: string; seconds: number }) => Promise<unknown>
  disabled?: boolean
  /** True from the start of a recording until it is sent or cancelled: the box hides its text field. */
  onRecordingChange?: (recording: boolean) => void
}) {
  const { t } = useTranslation('game')
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const state = useAudioRecorderState(recorder, 250)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const limit = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (limit.current) clearTimeout(limit.current)
    },
    [],
  )

  const finish = async (send: boolean): Promise<void> => {
    if (limit.current) clearTimeout(limit.current)
    limit.current = null
    setBusy(true)
    try {
      const seconds = voiceSeconds(recorder.getStatus().durationMillis)
      await recorder.stop()
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
      if (send && recorder.uri) {
        const path = await uploadVoiceNote(gameId, recorder.uri)
        await onSend({ path, seconds })
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      onRecordingChange?.(false)
    }
  }

  const start = async (): Promise<void> => {
    setError(null)
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) throw new Error(t('voice.noMic'))
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      onRecordingChange?.(true)
      // Stop and send at the limit the server accepts.
      limit.current = setTimeout(() => void finish(true), MAX_VOICE_SECONDS * 1000)
    } catch (e) {
      setError(e)
    }
  }

  if (state.isRecording || busy) {
    return (
      <View style={styles.recording}>
        <View style={styles.dot} />
        <Text variant="label" numberOfLines={1} style={styles.flex}>
          {busy ? t('voice.sending') : t('voice.recording', { time: formatClock(state.durationMillis / 1000) })}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void finish(false)}
          hitSlop={8}
          style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
          <Text variant="label" tone={color.inkMuted}>
            {t('voice.cancel')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voice.send')}
          disabled={busy}
          onPress={() => void finish(true)}
          style={({ pressed }) => [styles.sendVoice, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={color.onPrimary} /> : <Ionicons name="send" size={18} color={color.onPrimary} />}
        </Pressable>
      </View>
    )
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('voice.record')}
        disabled={disabled}
        onPress={() => void start()}
        style={({ pressed }) => [styles.mic, disabled && styles.off, pressed && styles.pressed]}>
        <Ionicons name="mic" size={20} color={color.ink} />
      </Pressable>
      {error ? <VoiceError error={error} /> : null}
    </>
  )
}

/** Voice-note failures say what went wrong (device, permission, upload), not a generic line. */
function VoiceError({ error }: { error: unknown }) {
  const { t } = useTranslation('game')
  const message =
    error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return (
    <Text variant="caption" tone={color.danger} accessibilityRole="alert" style={styles.errorText}>
      {message ? t('voice.failed', { reason: message }) : t('voice.failedGeneric')}
    </Text>
  )
}

/** Play / pause a voice note, with its length. The link is fetched when the comment shows. */
export function VoicePlayer({ path, seconds }: { path: string; seconds: number | null }) {
  const { t } = useTranslation('game')
  const url = useQuery({ queryKey: ['voice-note', path], queryFn: () => voiceNoteUrl(path), staleTime: 50 * 60_000 })
  if (url.isPending) return <ActivityIndicator color={color.inkMuted} style={styles.loading} />
  if (url.error || !url.data) return <VoiceError error={url.error ?? new Error(t('voice.unavailable'))} />
  return <Player url={url.data} seconds={seconds} />
}

function Player({ url, seconds }: { url: string; seconds: number | null }) {
  const { t } = useTranslation('game')
  const player = useAudioPlayer(url)
  const status = useAudioPlayerStatus(player)
  const total = status.duration > 0 ? status.duration : (seconds ?? 0)
  const toggle = (): void => {
    if (status.playing) {
      player.pause()
      return
    }
    // Played to the end: start again.
    if (total > 0 && status.currentTime >= total - 0.2) void player.seekTo(0)
    player.play()
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? t('voice.pause') : t('voice.play')}
      onPress={toggle}
      style={({ pressed }) => [styles.player, pressed && styles.pressed]}>
      <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={color.onPrimary} style={styles.playIcon} />
      <Ionicons name="mic-outline" size={16} color={color.inkMuted} />
      <Text variant="label" tone={color.inkMuted}>
        {status.playing || status.currentTime > 0 ? `${formatClock(status.currentTime)} / ${formatClock(total)}` : formatClock(total)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mic: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  recording: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT,
    paddingStart: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  small: { paddingHorizontal: space.sm, minHeight: HIT, justifyContent: 'center' },
  sendVoice: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.danger },
  errorText: { flexShrink: 1 },
  loading: { alignSelf: 'flex-start' },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    paddingEnd: space.md,
    paddingStart: space.xs,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  playIcon: {
    backgroundColor: color.primary,
    borderRadius: 16,
    width: 32,
    height: 32,
    textAlign: 'center',
    lineHeight: 32,
    overflow: 'hidden',
  },
})
