import { randomUUID } from 'expo-crypto'
import { File } from 'expo-file-system'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { voiceFileFor } from './voiceFormat'

export const VOICE_BUCKET = 'voice-notes'

/** Uploads a finished recording to <game>/<random>.<ext>; returns the storage path for the comment. */
export async function uploadVoiceNote(gameId: string, uri: string): Promise<string> {
  let body: Blob | ArrayBuffer
  let mime: string | null = null
  if (Platform.OS === 'web') {
    // The web recorder hands back a blob: URL.
    const blob = await (await fetch(uri)).blob()
    body = blob
    mime = blob.type
  } else {
    // Phones record AAC (.m4a) to a local file.
    body = await readRecording(uri)
  }
  const file = voiceFileFor(mime)
  const path = `${gameId}/${randomUUID()}.${file.ext}`
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(path, body, { contentType: file.contentType, upsert: false })
  if (error) throw error
  return path
}

/** The recorded file's bytes: the file-system API first, fetch as a fallback; never an empty upload. */
async function readRecording(uri: string): Promise<ArrayBuffer> {
  const fileUri = uri.includes('://') ? uri : `file://${uri}`
  try {
    const bytes = await new File(fileUri).arrayBuffer()
    if (bytes.byteLength > 0) return bytes
  } catch {
    // Fall through to fetch.
  }
  const bytes = await (await fetch(fileUri)).arrayBuffer()
  if (bytes.byteLength === 0) throw new Error('The recording is empty. Try again and speak for a second or two.')
  return bytes
}

/** A short-lived link to play a voice note (the bucket is private). */
export async function voiceNoteUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}
