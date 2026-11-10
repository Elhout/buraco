import { describe, expect, it } from 'vitest'
import { formatClock, pickWebMime, voiceFileFor, voiceSeconds } from './voiceFormat'

describe('voiceFileFor', () => {
  it('maps what was recorded to a file type the server accepts', () => {
    expect(voiceFileFor('audio/mp4')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' })
    expect(voiceFileFor('audio/webm;codecs=opus')).toEqual({ ext: 'webm', contentType: 'audio/webm' })
    expect(voiceFileFor('audio/ogg')).toEqual({ ext: 'ogg', contentType: 'audio/ogg' })
    expect(voiceFileFor(undefined)).toEqual({ ext: 'm4a', contentType: 'audio/mp4' })
  })
})

describe('formatClock / voiceSeconds', () => {
  it('shows m:ss and keeps the length within 1–300 s', () => {
    expect(formatClock(7)).toBe('0:07')
    expect(formatClock(83.4)).toBe('1:23')
    expect(voiceSeconds(400)).toBe(1)
    expect(voiceSeconds(12_600)).toBe(13)
    expect(voiceSeconds(999_000)).toBe(300)
  })
})

describe('pickWebMime', () => {
  it('prefers MP4/AAC, which iPhone Safari can play back', () => {
    const safari = (m: string) => m.startsWith('audio/mp4') || m.startsWith('audio/webm')
    expect(pickWebMime(safari)).toBe('audio/mp4;codecs=mp4a.40.2')
  })

  it('falls back to WebM, then to the browser default', () => {
    expect(pickWebMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickWebMime(() => false)).toBeUndefined()
  })
})
