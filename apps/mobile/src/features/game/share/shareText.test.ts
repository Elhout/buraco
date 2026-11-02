import { describe, expect, it } from 'vitest'
import { roundRow, view } from '../live/testFixtures'
import { gameShareText, whatsappUrl } from './shareText'

// Echoes the key and its values, so the test reads the message structure without real strings.
const t = (key: string, values?: Record<string, string | number>): string =>
  values
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key
const n = (value: number): string => String(value)

describe('gameShareText', () => {
  it('a live game: score, target and every counted round with the running total', () => {
    const v = view([
      roundRow(1, 'confirmed', 400, 500, 1),
      roundRow(2, 'voided', 9, 9, 1),
      roundRow(3, 'confirmed', 300, 380, 1, [[1, 100]]),
    ])
    expect(gameShareText(v, t, n).split('\n')).toEqual([
      'share.live',
      '',
      'share.team(team=A,names=U1 · U3,score=800)',
      'share.team(team=B,names=U2 · U4,score=880)',
      'share.target(points=2000,rounds=2,count=2)',
      '',
      'share.rounds',
      'share.round(n=1,a=400,b=500,totalA=400,totalB=500)',
      'share.round(n=2,a=400,b=380,totalA=800,totalB=880)',
      '',
      'https://buraco-club.pages.dev/game/g1',
    ])
  })

  it('a finished game: the winner gets the trophy and the link opens its history', () => {
    const text = gameShareText(view([roundRow(1, 'confirmed', 2100, 300, 1)], { status: 'finished', winner_team: 'A' }), t, n)
    expect(text).toContain('share.final')
    expect(text).toContain('share.team(team=A,names=U1 · U3,score=2100) 🏆')
    expect(text).toContain('share.winner(team=A)')
    expect(text).toContain('https://buraco-club.pages.dev/history/g1')
  })
})

describe('whatsappUrl', () => {
  it('encodes the text for wa.me', () => {
    expect(whatsappUrl('A 1 – 2 B\nRound 1')).toBe('https://wa.me/?text=A%201%20%E2%80%93%202%20B%0ARound%201')
  })
})
