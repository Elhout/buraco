import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Club, rpc, seedClub } from './fixtures'
import { actAs, asService, createDb, createUser, inTx, rejects } from './harness'

let db: PGlite
let club: Club
let outsider: string

beforeAll(async () => {
  db = await createDb()
  club = await seedClub(db, 'Chat')
  outsider = await createUser(db, 'Outsider')
}, 120_000)

describe('send_chat_message', () => {
  it('posts a trimmed message that every member can read', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      const id = await rpc<string>(tx, 'public.send_chat_message($1, $2)', [club.clubId, '  Who is in tonight?  '])
      await actAs(tx, club.players[3])
      const { rows } = await tx.query<{ id: string; user_id: string; body: string }>(
        `select id, user_id, body from public.chat_messages where club_id = $1`,
        [club.clubId],
      )
      expect(rows).toEqual([{ id, user_id: club.players[0], body: 'Who is in tonight?' }])
    })
  })

  it('refuses empty and over-long messages', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      await rejects(tx, () => rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, '   ']), /message is empty/)
      await rejects(tx, () => rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'x'.repeat(1001)]), /message is too long/)
    })
  })

  it('keeps outsiders out: they can neither post nor read', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'members only'])
      await actAs(tx, outsider)
      await rejects(tx, () => rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'hi']), /not a member/)
      expect((await tx.query(`select 1 from public.chat_messages where club_id = $1`, [club.clubId])).rows).toHaveLength(0)
      await rejects(
        tx,
        () => tx.query(`insert into public.chat_messages (club_id, user_id, body) values ($1, $2, 'x')`, [club.clubId, outsider]),
        /permission denied/,
      )
    })
  })

  it('notifies every other member, with the sender name and a short preview', async () => {
    await inTx(db, async (tx) => {
      await actAs(tx, club.players[1])
      await rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'y'.repeat(300)])
      await tx.exec('reset role')
      const { rows } = await tx.query<{ user_id: string; deep_link: string; payload: { sender: string; text: string } }>(
        `select user_id, deep_link, payload from public.notification_queue where event = 'chat_message'`,
      )
      expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([club.players[0], club.players[2], club.players[3]]))
      expect(rows[0]!.deep_link).toBe('/chat')
      expect(rows[0]!.payload.sender).toBe('Chat-Sara')
      expect(rows[0]!.payload.text).toHaveLength(140)
    })
  })
})

describe('chat pushes and the open chat', () => {
  it('skips a phone that has the chat open in the foreground', async () => {
    await inTx(db, async (tx) => {
      const reader = club.players[2]
      await actAs(tx, reader)
      await rpc(tx, `public.register_device('ExpoPushToken[chat-open]', 'android')`)
      await rpc(tx, `public.set_device_state('ExpoPushToken[chat-open]', 'active', null, true)`)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'are you there?'])
      const claimed = await asService(tx, () => rpc<{ event: string; tokens: string[] }[]>(tx, 'public.claim_notifications(100)'))
      const forReader = claimed.filter((n) => n.event === 'chat_message' && n.tokens.includes('ExpoPushToken[chat-open]'))
      expect(forReader).toHaveLength(0)
    })
  })

  it('still reaches that phone once the chat is closed', async () => {
    await inTx(db, async (tx) => {
      const reader = club.players[2]
      await actAs(tx, reader)
      await rpc(tx, `public.register_device('ExpoPushToken[chat-closed]', 'android')`)
      await rpc(tx, `public.set_device_state('ExpoPushToken[chat-closed]', 'active', null, false)`)
      await actAs(tx, club.players[0])
      await rpc(tx, 'public.send_chat_message($1, $2)', [club.clubId, 'ping'])
      const claimed = await asService(tx, () => rpc<{ event: string; tokens: string[] }[]>(tx, 'public.claim_notifications(100)'))
      expect(claimed.some((n) => n.event === 'chat_message' && n.tokens.includes('ExpoPushToken[chat-closed]'))).toBe(true)
    })
  })
})
