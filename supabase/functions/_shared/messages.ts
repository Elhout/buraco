// Push notification texts for every notification_queue event, in English and Arabic.
// Pure TypeScript: no Deno or npm imports, so the same file runs in the Edge Functions and in vitest.
// Team labels stay Latin `A`/`B` in both languages.

export type Lang = 'en' | 'ar'

export interface PushText {
  title: string
  body: string
}

type Payload = Record<string, unknown>
type Formatter = (p: Payload) => PushText
type LangFormatters = Record<Lang, Formatter>

// ---------------------------------------------------------------- payload readers (never throw)

const str = (p: Payload, key: string): string | null => {
  const v = p[key]
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

const num = (p: Payload, key: string): number | null => {
  const v = p[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

const names = (p: Payload, key: string): string[] => {
  const v = p[key]
  if (!Array.isArray(v)) return []
  return v.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => n.trim())
}

const team = (p: Payload, key: string): 'A' | 'B' | null => {
  const v = p[key]
  return v === 'A' || v === 'B' ? v : null
}

// ---------------------------------------------------------------- language helpers

/** "Sara", "Sara and Nour", "Sara, Nour and Ali" / "سارة"، "سارة ونور"، "سارة، نور وعلي". */
export const joinNames = (list: readonly string[], lang: Lang): string => {
  if (list.length <= 1) return list[0] ?? ''
  const head = list.slice(0, -1)
  const last = list[list.length - 1] ?? ''
  return lang === 'ar' ? `${head.join('، ')} و${last}` : `${head.join(', ')} and ${last}`
}

const you = (partner: string | null, lang: Lang): string => {
  if (lang === 'ar') return partner ? `أنت و${partner}` : 'أنت'
  return partner ? `you and ${partner}` : 'you'
}

/** Arabic counted noun for minutes: 1 دقيقة واحدة, 2 دقيقتان, 3–10 دقائق, 11+ دقيقة. */
const arMinutes = (n: number): string => {
  if (n === 1) return 'دقيقة واحدة'
  if (n === 2) return 'دقيقتان'
  if (n >= 3 && n <= 10) return `${n} دقائق`
  return `${n} دقيقة`
}

const enMinutes = (n: number): string => (n === 1 ? '1 minute' : `${n} minutes`)

// ---------------------------------------------------------------- events

const gameInvite: LangFormatters = {
  en: (p) => {
    const host = str(p, 'host') ?? 'A club member'
    const opponents = names(p, 'opponents')
    const vs = opponents.length > 0 ? joinNames(opponents, 'en') : 'the other team'
    return { title: 'Game invite', body: `${host} invited you: ${you(str(p, 'partner'), 'en')} vs ${vs}. Confirm with PIN` }
  },
  ar: (p) => {
    const host = str(p, 'host') ?? 'أحد أعضاء النادي'
    const opponents = names(p, 'opponents')
    const vs = opponents.length > 0 ? joinNames(opponents, 'ar') : 'الفريق الآخر'
    return { title: 'دعوة إلى مباراة', body: `دعاك ${host}: ${you(str(p, 'partner'), 'ar')} ضد ${vs}. أكّد بالرمز السري` }
  },
}

const inviteExpiring: LangFormatters = {
  en: () => ({ title: 'Invite expiring', body: 'Your seat expires in 2 minutes' }),
  ar: () => ({ title: 'الدعوة على وشك الانتهاء', body: 'ينتهي حجز مقعدك خلال دقيقتين' }),
}

const gameStarted: LangFormatters = {
  en: (p) => {
    const a = names(p, 'team_a')
    const b = names(p, 'team_b')
    if (a.length === 0 && b.length === 0) return { title: 'Game started', body: 'A game just started' }
    const teamA = a.length > 0 ? joinNames(a, 'en') : 'Team A'
    const teamB = b.length > 0 ? joinNames(b, 'en') : 'Team B'
    return { title: 'Game started', body: `${teamA} vs ${teamB} just started` }
  },
  ar: (p) => {
    const a = names(p, 'team_a')
    const b = names(p, 'team_b')
    if (a.length === 0 && b.length === 0) return { title: 'بدأت مباراة', body: 'بدأت مباراة للتو' }
    const teamA = a.length > 0 ? joinNames(a, 'ar') : 'الفريق A'
    const teamB = b.length > 0 ? joinNames(b, 'ar') : 'الفريق B'
    return { title: 'بدأت مباراة', body: `بدأت للتو مباراة ${teamA} ضد ${teamB}` }
  },
}

const roundToConfirm: LangFormatters = {
  en: (p) => {
    const n = num(p, 'round_no')
    const a = num(p, 'a')
    const b = num(p, 'b')
    const round = n === null ? 'New round' : `Round ${n}`
    const body = a === null || b === null ? `${round} is waiting for your confirmation` : `${round}: ${a} vs ${b}. Confirm?`
    return { title: 'Round to confirm', body }
  },
  ar: (p) => {
    const n = num(p, 'round_no')
    const a = num(p, 'a')
    const b = num(p, 'b')
    const round = n === null ? 'جولة جديدة' : `الجولة ${n}`
    const body = a === null || b === null ? `${round} بانتظار تأكيدك` : `${round}: ${a} مقابل ${b}. هل تؤكد؟`
    return { title: 'جولة بانتظار تأكيدك', body }
  },
}

/** Winner's total first: "Team A wins 2010 to 1840". */
const resultScores = (p: Payload, winner: 'A' | 'B'): [number, number] | null => {
  const a = num(p, 'a')
  const b = num(p, 'b')
  if (a === null || b === null) return null
  return winner === 'A' ? [a, b] : [b, a]
}

const resultToConfirm: LangFormatters = {
  en: (p) => {
    const w = team(p, 'winner')
    const title = 'Final result'
    if (w === null) return { title, body: 'The final result is ready. Confirm with PIN' }
    const s = resultScores(p, w)
    const body = s ? `Team ${w} wins ${s[0]} to ${s[1]}. Confirm with PIN` : `Team ${w} wins. Confirm with PIN`
    return { title, body }
  },
  ar: (p) => {
    const w = team(p, 'winner')
    const title = 'النتيجة النهائية'
    if (w === null) return { title, body: 'النتيجة النهائية جاهزة. أكّد بالرمز السري' }
    const s = resultScores(p, w)
    const body = s ? `فاز الفريق ${w} بنتيجة ${s[0]} مقابل ${s[1]}. أكّد بالرمز السري` : `فاز الفريق ${w}. أكّد بالرمز السري`
    return { title, body }
  },
}

/** Club chat: the sender as the title, the message (first 140 characters) as the body. */
const chatMessage: LangFormatters = {
  en: (p) => ({ title: str(p, 'sender') ?? 'Club chat', body: str(p, 'text') ?? 'New message' }),
  ar: (p) => ({ title: str(p, 'sender') ?? 'دردشة النادي', body: str(p, 'text') ?? 'رسالة جديدة' }),
}

/** Lock-screen score after every counted round: the totals in the title, who plays in the body. */
const liveScore: LangFormatters = {
  en: (p) => {
    const a = num(p, 'a')
    const b = num(p, 'b')
    const n = num(p, 'round_no')
    if (a === null || b === null) return { title: 'Live score', body: 'A new round was added' }
    const teamA = names(p, 'team_a')
    const teamB = names(p, 'team_b')
    const lineup = teamA.length > 0 && teamB.length > 0 ? `${joinNames(teamA, 'en')} vs ${joinNames(teamB, 'en')}` : null
    const round = n === null ? null : `Round ${n}`
    return { title: `A ${a} – ${b} B`, body: [round, lineup].filter(Boolean).join(': ') || 'Live score' }
  },
  ar: (p) => {
    const a = num(p, 'a')
    const b = num(p, 'b')
    const n = num(p, 'round_no')
    if (a === null || b === null) return { title: 'النتيجة المباشرة', body: 'أُضيفت جولة جديدة' }
    const teamA = names(p, 'team_a')
    const teamB = names(p, 'team_b')
    const lineup = teamA.length > 0 && teamB.length > 0 ? `${joinNames(teamA, 'ar')} ضد ${joinNames(teamB, 'ar')}` : null
    const round = n === null ? null : `الجولة ${n}`
    return { title: `A ${a} – ${b} B`, body: [round, lineup].filter(Boolean).join(': ') || 'النتيجة المباشرة' }
  },
}

const ghostVerify: LangFormatters = {
  en: () => ({ title: 'Verify result', body: "Confirm last night's result?" }),
  ar: () => ({ title: 'تأكيد النتيجة', body: 'هل تؤكد نتيجة مباراة الليلة الماضية؟' }),
}

const undoRequested: LangFormatters = {
  en: (p) => {
    const who = str(p, 'requester') ?? 'The other team'
    const n = num(p, 'round_no')
    return { title: 'Undo requested', body: `${who} wants to undo ${n === null ? 'the last round' : `round ${n}`}` }
  },
  ar: (p) => {
    const who = str(p, 'requester') ?? 'الفريق الآخر'
    const n = num(p, 'round_no')
    return { title: 'طلب تراجع', body: `يريد ${who} التراجع عن ${n === null ? 'الجولة الأخيرة' : `الجولة ${n}`}` }
  },
}

const tournamentTable: LangFormatters = {
  en: (p) => {
    const r = num(p, 'round_no')
    const t = num(p, 'table_no')
    const where = [r === null ? null : `Round ${r}`, t === null ? null : `Table ${t}`].filter(Boolean).join(', ')
    const opponents = names(p, 'opponents')
    const vs = opponents.length > 0 ? joinNames(opponents, 'en') : 'your opponents'
    const lineup = `${you(str(p, 'partner'), 'en')} vs ${vs}`
    return { title: 'Table assignment', body: where ? `${where}: ${lineup}` : `Next round: ${lineup}` }
  },
  ar: (p) => {
    const r = num(p, 'round_no')
    const t = num(p, 'table_no')
    const where = [r === null ? null : `الجولة ${r}`, t === null ? null : `الطاولة ${t}`].filter(Boolean).join('، ')
    const opponents = names(p, 'opponents')
    const vs = opponents.length > 0 ? joinNames(opponents, 'ar') : 'خصومك'
    const lineup = `${you(str(p, 'partner'), 'ar')} ضد ${vs}`
    return { title: 'توزيع الطاولات', body: where ? `${where}: ${lineup}` : `الجولة التالية: ${lineup}` }
  },
}

const tournamentClock: LangFormatters = {
  en: (p) => {
    const r = num(p, 'round_no')
    const m = num(p, 'minutes_left')
    const round = r === null ? 'this round' : `round ${r}`
    return { title: 'Round clock', body: m === null ? `Time is almost up in ${round}` : `${enMinutes(m)} left in ${round}` }
  },
  ar: (p) => {
    const r = num(p, 'round_no')
    const m = num(p, 'minutes_left')
    const round = r === null ? 'هذه الجولة' : `الجولة ${r}`
    const body = m === null ? `اقترب انتهاء الوقت في ${round}` : `بقي ${arMinutes(m)} على انتهاء ${round}`
    return { title: 'ساعة الجولة', body }
  },
}

const fallback: LangFormatters = {
  en: () => ({ title: 'Buraco', body: 'You have a new notification' }),
  ar: () => ({ title: 'بوراكو', body: 'لديك إشعار جديد' }),
}

const FORMATTERS: Readonly<Record<string, LangFormatters>> = {
  game_invite: gameInvite,
  invite_expiring: inviteExpiring,
  game_started: gameStarted,
  round_to_confirm: roundToConfirm,
  live_score: liveScore,
  chat_message: chatMessage,
  result_to_confirm: resultToConfirm,
  ghost_verify: ghostVerify,
  undo_requested: undoRequested,
  tournament_table: tournamentTable,
  tournament_clock: tournamentClock,
}

export const KNOWN_EVENTS: readonly string[] = Object.keys(FORMATTERS)

/** Title and body for one queued push, in the recipient's language. Unknown events get a generic text. */
export const formatPush = (event: string, payload: Record<string, unknown>, lang: Lang): PushText => {
  const formatters = Object.prototype.hasOwnProperty.call(FORMATTERS, event) ? FORMATTERS[event] : undefined
  const safeLang: Lang = lang === 'ar' ? 'ar' : 'en'
  const safePayload: Payload = payload !== null && typeof payload === 'object' ? payload : {}
  return (formatters ?? fallback)[safeLang](safePayload)
}
