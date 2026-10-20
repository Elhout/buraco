import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), '../../../../supabase/migrations')

/** The minimum of Supabase's platform schema that our migrations depend on. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  grant usage on schema auth, extensions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's default privileges: everything in public is granted to the API roles explicitly,
  -- so migrations must revoke from anon/authenticated (not just PUBLIC). RLS restricts rows.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STUB)
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  return db
}

/** With a username the user gets the login email manage-accounts would give it. */
export async function createUser(db: PGlite, displayName: string, username?: string): Promise<string> {
  const email = username ? `${username}@users.buraco.app` : null
  const { rows } = await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    email,
    { display_name: displayName },
  ])
  const id = rows[0]?.id
  if (!id) throw new Error('failed to create user')
  return id
}

/**
 * Switches the transaction to the given API role with Supabase-style JWT claims.
 * `amr` mimics a sign-in that many seconds ago (used by reset_pin's freshness check).
 */
export async function actAs(tx: Transaction, userId: string | null, signedInSecondsAgo = 3600): Promise<void> {
  await tx.exec('reset role')
  const amr = [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - signedInSecondsAgo }]
  const claims = userId ? { sub: userId, role: 'authenticated', amr } : { role: 'anon' }
  await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
  await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
}

/** Runs fn as the anon (signed-out) role inside a transaction that is always rolled back. */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await actAs(tx, null)
    const result = await fn(tx)
    await tx.rollback()
    return result
  })
}

/** Runs fn as an authenticated client (RLS applies) inside a transaction that is always rolled back. */
export async function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await actAs(tx, userId)
    const result = await fn(tx)
    await tx.rollback()
    return result
  })
}

/** Same as asUser but commits, for setting up state that later steps depend on. */
export async function asUserCommit<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await actAs(tx, userId)
    return fn(tx)
  })
}

/** Runs fn as superuser in a transaction that is always rolled back; use actAs to switch users inside. */
export async function inTx<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx)
    await tx.rollback()
    return result
  })
}

/** Runs fn as the service role (Edge Functions, cron) in a rolled-back transaction. */
export async function asService<T>(tx: Transaction, fn: () => Promise<T>): Promise<T> {
  await tx.exec('reset role')
  await tx.exec('set local role service_role')
  const result = await fn()
  await tx.exec('reset role')
  return result
}

/**
 * Asserts that fn fails with a message matching pattern, without poisoning the surrounding
 * transaction (a failed statement otherwise aborts everything after it).
 */
export async function rejects(tx: Transaction, fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await tx.exec('savepoint expected_error')
  let error: unknown
  try {
    await fn()
  } catch (e) {
    error = e
  }
  if (error === undefined) {
    await tx.exec('release savepoint expected_error')
    throw new Error(`expected an error matching ${pattern}, but the call succeeded`)
  }
  await tx.exec('rollback to savepoint expected_error')
  const message = error instanceof Error ? error.message : String(error)
  if (!pattern.test(message)) throw new Error(`expected an error matching ${pattern}, got: ${message}`)
}
