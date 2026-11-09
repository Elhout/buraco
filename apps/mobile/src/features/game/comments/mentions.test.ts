import { describe, expect, it } from 'vitest'
import { insertMention, mentionQuery, mentionedIds, splitMentions } from './mentions'

describe('mentionQuery', () => {
  it('reads the name being typed after @', () => {
    expect(mentionQuery('@')).toBe('')
    expect(mentionQuery('nice game @sa')).toBe('sa')
    expect(mentionQuery('hey @Bo R')).toBe('Bo R')
  })

  it('ignores emails and finished lines', () => {
    expect(mentionQuery('me@home')).toBeNull()
    expect(mentionQuery('no mention here')).toBeNull()
    expect(mentionQuery('@sa\nnext line')).toBeNull()
  })
})

describe('insertMention', () => {
  it('completes the name and adds a space', () => {
    expect(insertMention('well played @sa', 'Sara')).toBe('well played @Sara ')
    expect(insertMention('@', 'Bo Rashid')).toBe('@Bo Rashid ')
  })
})

describe('mentionedIds', () => {
  it('keeps the picked members whose @Name is still in the text', () => {
    const picked = [
      { userId: 'u1', name: 'Sara' },
      { userId: 'u2', name: 'AK' },
      { userId: 'u1', name: 'Sara' },
    ]
    expect(mentionedIds('@Sara and @MK', picked)).toEqual(['u1'])
  })
})

describe('splitMentions', () => {
  it('marks the mentions, longest names first', () => {
    expect(splitMentions('Go @Bo Rashid and @Bo!', ['Bo', 'Bo Rashid'])).toEqual([
      { text: 'Go ', mention: false },
      { text: '@Bo Rashid', mention: true },
      { text: ' and ', mention: false },
      { text: '@Bo', mention: true },
      { text: '!', mention: false },
    ])
  })

  it('plain text stays one segment', () => {
    expect(splitMentions('GG', ['Sara'])).toEqual([{ text: 'GG', mention: false }])
  })
})
