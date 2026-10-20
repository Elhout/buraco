import { describe, expect, it } from 'vitest'
import { formatPush, joinNames, KNOWN_EVENTS } from '../../../supabase/functions/_shared/messages.ts'

describe('joinNames', () => {
  it.each([
    [[], 'en', ''],
    [['Sara'], 'en', 'Sara'],
    [['Ahmed', 'Nour'], 'en', 'Ahmed and Nour'],
    [['Ahmed', 'Nour', 'Ali'], 'en', 'Ahmed, Nour and Ali'],
    [['أحمد', 'نور'], 'ar', 'أحمد ونور'],
    [['أحمد', 'نور', 'علي'], 'ar', 'أحمد، نور وعلي'],
  ] as const)('joins %j in %s', (list, lang, expected) => {
    expect(joinNames(list, lang)).toBe(expected)
  })
})

describe('game_invite', () => {
  const payload = { host: 'Omar', partner: 'Sara', opponents: ['Ahmed', 'Nour'] }

  it('matches the spec text in English', () => {
    expect(formatPush('game_invite', payload, 'en')).toEqual({
      title: 'Game invite',
      body: 'Omar invited you: you and Sara vs Ahmed and Nour. Confirm with PIN',
    })
  })

  it('is written in Arabic', () => {
    expect(formatPush('game_invite', { host: 'عمر', partner: 'سارة', opponents: ['أحمد', 'نور'] }, 'ar')).toEqual({
      title: 'دعوة إلى مباراة',
      body: 'دعاك عمر: أنت وسارة ضد أحمد ونور. أكّد بالرمز السري',
    })
  })

  it('falls back when host, partner and opponents are missing', () => {
    expect(formatPush('game_invite', {}, 'en').body).toBe('A club member invited you: you vs the other team. Confirm with PIN')
    expect(formatPush('game_invite', {}, 'ar').body).toBe('دعاك أحد أعضاء النادي: أنت ضد الفريق الآخر. أكّد بالرمز السري')
  })

  it('drops null and non-string names', () => {
    const body = formatPush('game_invite', { host: '  ', partner: null, opponents: ['Ahmed', null, 3] }, 'en').body
    expect(body).toBe('A club member invited you: you vs Ahmed. Confirm with PIN')
  })
})

describe('invite_expiring', () => {
  it('warns in both languages', () => {
    expect(formatPush('invite_expiring', {}, 'en')).toEqual({ title: 'Invite expiring', body: 'Your seat expires in 2 minutes' })
    expect(formatPush('invite_expiring', {}, 'ar')).toEqual({
      title: 'الدعوة على وشك الانتهاء',
      body: 'ينتهي حجز مقعدك خلال دقيقتين',
    })
  })
})

describe('game_started', () => {
  const payload = { team_a: ['Omar', 'Sara'], team_b: ['Ahmed', 'Nour'] }

  it('matches the spec text in English', () => {
    expect(formatPush('game_started', payload, 'en')).toEqual({
      title: 'Game started',
      body: 'Omar and Sara vs Ahmed and Nour just started',
    })
  })

  it('is written in Arabic', () => {
    expect(formatPush('game_started', payload, 'ar')).toEqual({
      title: 'بدأت مباراة',
      body: 'بدأت للتو مباراة Omar وSara ضد Ahmed وNour',
    })
  })

  it('uses Latin team labels when one side is missing', () => {
    expect(formatPush('game_started', { team_a: ['Omar'] }, 'en').body).toBe('Omar vs Team B just started')
    expect(formatPush('game_started', { team_b: ['نور'] }, 'ar').body).toBe('بدأت للتو مباراة الفريق A ضد نور')
  })

  it('falls back when both teams are missing', () => {
    expect(formatPush('game_started', {}, 'en').body).toBe('A game just started')
    expect(formatPush('game_started', { team_a: 'x' }, 'ar').body).toBe('بدأت مباراة للتو')
  })
})

describe('round_to_confirm', () => {
  it('matches the spec text in English', () => {
    expect(formatPush('round_to_confirm', { round_no: 4, a: 350, b: 220 }, 'en')).toEqual({
      title: 'Round to confirm',
      body: 'Round 4: 350 vs 220. Confirm?',
    })
  })

  it('is written in Arabic', () => {
    expect(formatPush('round_to_confirm', { round_no: 4, a: 350, b: 220 }, 'ar')).toEqual({
      title: 'جولة بانتظار تأكيدك',
      body: 'الجولة 4: 350 مقابل 220. هل تؤكد؟',
    })
  })

  it('accepts numeric strings and negative scores', () => {
    expect(formatPush('round_to_confirm', { round_no: '2', a: -100, b: '0' }, 'en').body).toBe('Round 2: -100 vs 0. Confirm?')
  })

  it('falls back when scores or round number are missing', () => {
    expect(formatPush('round_to_confirm', { round_no: 4 }, 'en').body).toBe('Round 4 is waiting for your confirmation')
    expect(formatPush('round_to_confirm', { a: 1, b: 2 }, 'en').body).toBe('New round: 1 vs 2. Confirm?')
    expect(formatPush('round_to_confirm', {}, 'ar').body).toBe('جولة جديدة بانتظار تأكيدك')
  })
})

describe('result_to_confirm', () => {
  it('matches the spec text in English, winner first', () => {
    expect(formatPush('result_to_confirm', { winner: 'A', a: 2010, b: 1840 }, 'en')).toEqual({
      title: 'Final result',
      body: 'Team A wins 2010 to 1840. Confirm with PIN',
    })
    expect(formatPush('result_to_confirm', { winner: 'B', a: 1840, b: 2010 }, 'en').body).toBe('Team B wins 2010 to 1840. Confirm with PIN')
  })

  it('is written in Arabic with Latin team labels', () => {
    expect(formatPush('result_to_confirm', { winner: 'B', a: 1840, b: 2010 }, 'ar')).toEqual({
      title: 'النتيجة النهائية',
      body: 'فاز الفريق B بنتيجة 2010 مقابل 1840. أكّد بالرمز السري',
    })
  })

  it('falls back when scores or winner are missing', () => {
    expect(formatPush('result_to_confirm', { winner: 'A' }, 'en').body).toBe('Team A wins. Confirm with PIN')
    expect(formatPush('result_to_confirm', { winner: 'A' }, 'ar').body).toBe('فاز الفريق A. أكّد بالرمز السري')
    expect(formatPush('result_to_confirm', { winner: 'C', a: 1, b: 2 }, 'en').body).toBe('The final result is ready. Confirm with PIN')
    expect(formatPush('result_to_confirm', {}, 'ar').body).toBe('النتيجة النهائية جاهزة. أكّد بالرمز السري')
  })
})

describe('ghost_verify', () => {
  it('asks in both languages', () => {
    expect(formatPush('ghost_verify', {}, 'en')).toEqual({ title: 'Verify result', body: "Confirm last night's result?" })
    expect(formatPush('ghost_verify', {}, 'ar')).toEqual({
      title: 'تأكيد النتيجة',
      body: 'هل تؤكد نتيجة مباراة الليلة الماضية؟',
    })
  })
})

describe('undo_requested', () => {
  it('matches the spec text in English', () => {
    expect(formatPush('undo_requested', { requester: 'Omar', round_no: 4 }, 'en')).toEqual({
      title: 'Undo requested',
      body: 'Omar wants to undo round 4',
    })
  })

  it('is written in Arabic', () => {
    expect(formatPush('undo_requested', { requester: 'عمر', round_no: 4 }, 'ar')).toEqual({
      title: 'طلب تراجع',
      body: 'يريد عمر التراجع عن الجولة 4',
    })
  })

  it('falls back when requester and round are missing', () => {
    expect(formatPush('undo_requested', {}, 'en').body).toBe('The other team wants to undo the last round')
    expect(formatPush('undo_requested', {}, 'ar').body).toBe('يريد الفريق الآخر التراجع عن الجولة الأخيرة')
  })
})

describe('tournament_table', () => {
  const payload = { round_no: 3, table_no: 2, partner: 'X', opponents: ['Y', 'Z'] }

  it('matches the spec text in English', () => {
    expect(formatPush('tournament_table', payload, 'en')).toEqual({
      title: 'Table assignment',
      body: 'Round 3, Table 2: you and X vs Y and Z',
    })
  })

  it('is written in Arabic', () => {
    expect(formatPush('tournament_table', payload, 'ar')).toEqual({
      title: 'توزيع الطاولات',
      body: 'الجولة 3، الطاولة 2: أنت وX ضد Y وZ',
    })
  })

  it('handles a null partner', () => {
    expect(formatPush('tournament_table', { ...payload, partner: null }, 'en').body).toBe('Round 3, Table 2: you vs Y and Z')
    expect(formatPush('tournament_table', { ...payload, partner: null }, 'ar').body).toBe('الجولة 3، الطاولة 2: أنت ضد Y وZ')
  })

  it('falls back when round, table and opponents are missing', () => {
    expect(formatPush('tournament_table', { table_no: 5 }, 'en').body).toBe('Table 5: you vs your opponents')
    expect(formatPush('tournament_table', {}, 'en').body).toBe('Next round: you vs your opponents')
    expect(formatPush('tournament_table', {}, 'ar').body).toBe('الجولة التالية: أنت ضد خصومك')
  })
})

describe('tournament_clock', () => {
  it('matches the spec text in English', () => {
    expect(formatPush('tournament_clock', { round_no: 3, minutes_left: 5 }, 'en')).toEqual({
      title: 'Round clock',
      body: '5 minutes left in round 3',
    })
    expect(formatPush('tournament_clock', { round_no: 3, minutes_left: 1 }, 'en').body).toBe('1 minute left in round 3')
  })

  it.each([
    [1, 'بقي دقيقة واحدة على انتهاء الجولة 3'],
    [2, 'بقي دقيقتان على انتهاء الجولة 3'],
    [5, 'بقي 5 دقائق على انتهاء الجولة 3'],
    [15, 'بقي 15 دقيقة على انتهاء الجولة 3'],
  ])('uses the Arabic counted form for %i minutes', (minutes, body) => {
    expect(formatPush('tournament_clock', { round_no: 3, minutes_left: minutes }, 'ar')).toEqual({ title: 'ساعة الجولة', body })
  })

  it('falls back when round or minutes are missing', () => {
    expect(formatPush('tournament_clock', { minutes_left: 5 }, 'en').body).toBe('5 minutes left in this round')
    expect(formatPush('tournament_clock', { round_no: 3 }, 'en').body).toBe('Time is almost up in round 3')
    expect(formatPush('tournament_clock', {}, 'ar').body).toBe('اقترب انتهاء الوقت في هذه الجولة')
  })
})

describe('fallbacks', () => {
  it('gives a generic text for unknown events', () => {
    expect(formatPush('something_new', { a: 1 }, 'en')).toEqual({ title: 'Buraco', body: 'You have a new notification' })
    expect(formatPush('something_new', {}, 'ar')).toEqual({ title: 'بوراكو', body: 'لديك إشعار جديد' })
  })

  it('does not treat Object.prototype keys as events', () => {
    expect(formatPush('toString', {}, 'en').title).toBe('Buraco')
    expect(formatPush('__proto__', {}, 'en').title).toBe('Buraco')
  })

  it('treats an unexpected language as English', () => {
    expect(formatPush('ghost_verify', {}, 'fr' as 'en').body).toBe("Confirm last night's result?")
  })

  it.each(KNOWN_EVENTS)('never throws and never prints "undefined" for %s with a null payload', (event) => {
    for (const lang of ['en', 'ar'] as const) {
      const text = formatPush(event, null as unknown as Record<string, unknown>, lang)
      expect(text.title).not.toBe('')
      expect(text.body).not.toBe('')
      expect(`${text.title} ${text.body}`).not.toMatch(/undefined|null|NaN/)
    }
  })
})
