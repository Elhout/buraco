/** Voice notes: file type of a recording and the m:ss label. Pure (tested). */

export interface VoiceFile {
  readonly ext: 'm4a' | 'webm' | 'ogg' | 'wav'
  readonly contentType: string
}

/**
 * Phones record AAC in an .m4a file. Browsers say what they recorded: Safari (iPhone web app)
 * gives audio/mp4, Chrome audio/webm. Anything unknown is stored as m4a.
 */
export function voiceFileFor(mimeType: string | null | undefined): VoiceFile {
  const t = (mimeType ?? '').toLowerCase()
  if (t.includes('webm')) return { ext: 'webm', contentType: 'audio/webm' }
  if (t.includes('ogg')) return { ext: 'ogg', contentType: 'audio/ogg' }
  if (t.includes('wav')) return { ext: 'wav', contentType: 'audio/wav' }
  return { ext: 'm4a', contentType: 'audio/mp4' }
}

/** 0:07, 1:23 (a voice note lasts up to 5 minutes). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The server accepts 1 to 300 seconds. */
export const MAX_VOICE_SECONDS = 300
export const voiceSeconds = (millis: number): number => Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round(millis / 1000)))

/**
 * The web recorder's format: MP4/AAC first, because it plays everywhere (iPhone Safari plays a
 * WebM recording silently); WebM only when the browser cannot record MP4.
 */
export const WEB_MIME_PREFERENCE = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] as const

export function pickWebMime(isSupported: (mime: string) => boolean): string | undefined {
  return WEB_MIME_PREFERENCE.find((m) => isSupported(m))
}
