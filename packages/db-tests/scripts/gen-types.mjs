// Generates packages/shared/src/database.types.ts from the migrations, without Docker:
// loads every migration into PGlite (with the same Supabase stub as the tests) and introspects it.
// Output follows the shape of `supabase gen types typescript`. Run: pnpm --filter @buraco/db-tests gen:types
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = resolve(fileURLToPath(import.meta.url), '../../../..')
const migrationsDir = join(root, 'supabase/migrations')
const outFile = join(root, 'packages/shared/src/database.types.ts')

const harness = readFileSync(join(root, 'packages/db-tests/src/harness.ts'), 'utf8')
const stub = harness.match(/const SUPABASE_STUB = `([\s\S]*?)`/)[1]

const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec(stub)
for (const f of readdirSync(migrationsDir)
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), 'utf8'))
}

const enums = (
  await db.query(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`)
).rows
const enumNames = new Set(enums.map((e) => e.name))

const relations = (
  await db.query(`
  select c.relname as name, c.relkind as kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname`)
).rows

const columns = (
  await db.query(`
  select c.relname as rel, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
         t.typname as udt, t.typcategory as cat, et.typname as elem_udt,
         not a.attnotnull as nullable, (ad.adbin is not null or a.attidentity <> '') as has_default
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'v')
  order by c.relname, a.attnum`)
).rows

// Only what the app may call: functions executable by `authenticated`.
const functions = (
  await db.query(`
  select p.proname as name, p.pronargdefaults as ndefaults,
         coalesce(p.proargnames, '{}') as argnames,
         array(select format_type(x, null) from unnest(p.proargtypes) x) as argtypes,
         array(select t.typname from unnest(p.proargtypes) x join pg_type t on t.oid = x) as argudts,
         rt.typname as ret_udt, rt.typtype as ret_kind, p.proretset as returns_set,
         -- RETURNS TABLE (...) columns: the 't' mode arguments.
         array(select a.n from unnest(p.proargnames, p.proargmodes::text[]) with ordinality a(n, m, o) where a.m = 't' order by a.o) as out_names,
         array(select t.typname from unnest(p.proallargtypes, p.proargmodes::text[]) with ordinality a(x, m, o) join pg_type t on t.oid = a.x where a.m = 't' order by a.o) as out_udts
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
    and has_function_privilege('authenticated', p.oid, 'execute')
  order by p.proname`)
).rows

const tables = new Set(relations.filter((r) => r.kind === 'r').map((r) => r.name))

// Foreign keys, so supabase-js can type embedded selects like `club_members(clubs(*))`.
const foreignKeys = (
  await db.query(`
  select src.relname as rel, con.conname as name,
         array(select a.attname from unnest(con.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o) as columns,
         ref.relname as ref_rel,
         array(select a.attname from unnest(con.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o) as ref_columns,
         exists (
           select 1 from pg_constraint u
           where u.conrelid = con.conrelid and u.contype in ('p', 'u')
             and (select array_agg(x order by x) from unnest(u.conkey) x) = (select array_agg(x order by x) from unnest(con.conkey) x)
         ) as one_to_one
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid join pg_namespace n on n.oid = src.relnamespace
  join pg_class ref on ref.oid = con.confrelid join pg_namespace rn on rn.oid = ref.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
  order by src.relname, con.conname`)
).rows

const relationships = (rel) => {
  const fks = foreignKeys.filter((f) => f.rel === rel)
  if (!fks.length) return '[]'
  const list = (xs) => `[${xs.map((x) => `"${x}"`).join(', ')}]`
  return `[\n${fks
    .map(
      (f) =>
        `  {\n    foreignKeyName: "${f.name}"\n    columns: ${list(f.columns)}\n    isOneToOne: ${f.one_to_one}\n    referencedRelation: "${f.ref_rel}"\n    referencedColumns: ${list(f.ref_columns)}\n  },`,
    )
    .join('\n')}\n]`
}

function tsScalar(udt) {
  if (enumNames.has(udt)) return `Database['public']['Enums']['${udt}']`
  switch (udt) {
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number'
    case 'bool':
      return 'boolean'
    case 'json':
    case 'jsonb':
      return 'Json'
    case 'uuid':
    case 'text':
    case 'varchar':
    case 'date':
    case 'timestamptz':
    case 'timestamp':
    case 'interval':
      return 'string'
    default:
      if (tables.has(udt)) return `Database['public']['Tables']['${udt}']['Row']`
      return 'unknown'
  }
}
const tsType = (udt, elemUdt) => (udt.startsWith('_') ? `${tsScalar(elemUdt ?? udt.slice(1))}[]` : tsScalar(udt))

const indent = (s, n) =>
  s
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n')
const obj = (lines) => (lines.length ? `{\n${indent(lines.join('\n'), 2)}\n}` : 'Record<string, never>')

const relBlock = (rel, isView) => {
  const cols = columns.filter((c) => c.rel === rel)
  const row = cols.map((c) => `${c.name}: ${tsType(c.udt, c.elem_udt)}${isView || c.nullable ? ' | null' : ''}`)
  if (isView) return `${rel}: {\n  Row: ${indent(obj(row), 2).trimStart()}\n  Relationships: []\n}`
  const insert = cols.map(
    (c) => `${c.name}${c.nullable || c.has_default ? '?' : ''}: ${tsType(c.udt, c.elem_udt)}${c.nullable ? ' | null' : ''}`,
  )
  const update = cols.map((c) => `${c.name}?: ${tsType(c.udt, c.elem_udt)}${c.nullable ? ' | null' : ''}`)
  return `${rel}: {\n  Row: ${indent(obj(row), 2).trimStart()}\n  Insert: ${indent(obj(insert), 2).trimStart()}\n  Update: ${indent(obj(update), 2).trimStart()}\n  Relationships: ${indent(relationships(rel), 2).trimStart()}\n}`
}

const fnBlock = (f) => {
  const n = f.argudts.length
  const args = f.argudts.map((udt, i) => {
    const optional = i >= n - f.ndefaults
    return `${f.argnames[i] ?? `arg${i}`}${optional ? '?' : ''}: ${tsType(udt)}`
  })
  const columns = f.out_names.map((name, i) => `${name}: ${tsType(f.out_udts[i])}`)
  let ret = f.ret_udt === 'void' ? 'undefined' : columns.length ? `{ ${columns.join('; ')} }` : tsType(f.ret_udt)
  if (f.returns_set) ret += '[]'
  return `${f.name}: { Args: ${n ? `{ ${args.join('; ')} }` : 'Record<PropertyKey, never>'}; Returns: ${ret} }`
}

const out = `// GENERATED by packages/db-tests/scripts/gen-types.mjs from supabase/migrations. Do not edit.
// Same shape as \`supabase gen types typescript\`; once a project is linked, \`pnpm db:types\` works too.
// Relationships are left empty, so embedded selects need explicit typing.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: ${indent(obj(relations.filter((r) => r.kind === 'r').map((r) => relBlock(r.name, false))), 4).trimStart()}
    Views: ${indent(obj(relations.filter((r) => r.kind === 'v').map((r) => relBlock(r.name, true))), 4).trimStart()}
    Functions: ${indent(obj(functions.map(fnBlock)), 4).trimStart()}
    Enums: ${indent(obj(enums.map((e) => `${e.name}: ${e.labels.map((l) => `'${l}'`).join(' | ')}`)), 4).trimStart()}
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
export type Functions<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T]
`
writeFileSync(outFile, out)
console.log(`wrote ${outFile}: ${relations.length} relations, ${functions.length} functions, ${enums.length} enums`)
await db.close()
