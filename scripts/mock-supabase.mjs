// Faux Supabase local pour tester la configuration de PRODUCTION du site
// (VITE_DATA_SOURCE=supabase) sans projet Supabase : répond aux appels RPC de
// supabase-js (POST /rest/v1/rpc/<fonction>) comme PostgREST, avec la même base
// (migrations + seed + données d'exemple) rejouée dans PGlite.
// Rôle anon uniquement (site public) : les RPC admin et client échouent comme en production.
// Usage : node scripts/mock-supabase.mjs [port]   (4174 par défaut)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../supabase/tests/apply.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.argv[2] ?? 4174);
const db = await freshDb();
await db.exec(readFileSync(join(root, 'supabase', 'seed_demo.sql'), 'utf8'));

const functions = new Map(
  (
    await db.query(`
      select p.proname as name, (p.proargnames)[1:p.pronargs] as arg_names,
             array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality a(t, i) order by i) as arg_types,
             p.proretset as returns_set, format_type(p.prorettype, null) as return_type
      from pg_proc p where p.pronamespace = 'public'::regnamespace`)
  ).rows.map((r) => [r.name, r]),
);

function cast(name, type) {
  if (type === 'jsonb' || type === 'json') return `($1::jsonb->'${name}')::${type}`;
  if (type.endsWith('[]')) return `(case when jsonb_typeof($1::jsonb->'${name}') = 'array' then array(select jsonb_array_elements_text($1::jsonb->'${name}')) end)::${type}`;
  return `($1::jsonb->>'${name}')::${type}`;
}

async function callRpc(fn, args) {
  const meta = functions.get(fn);
  if (!meta || !/^[a-z_][a-z0-9_]*$/.test(fn)) return { status: 404, body: { code: 'PGRST202', message: `Fonction inconnue : ${fn}` } };
  const names = meta.arg_names ?? [];
  const named = names.map((n, i) => (n in args ? `${n} => ${cast(n, meta.arg_types[i])}` : null)).filter(Boolean);
  const call = `public.${fn}(${named.join(', ')})`;
  const sql = meta.returns_set
    ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from ${call} t`
    : `select to_jsonb(${call}) as r`;
  try {
    return await db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      const { rows } = await tx.query(sql, sql.includes('$1') ? [JSON.stringify(args)] : []);
      return { status: 200, body: rows[0]?.r ?? null };
    });
  } catch (e) {
    return { status: 400, body: { code: e.code ?? 'P0001', message: e.message, hint: e.hint ?? null, details: e.detail ?? null } };
  }
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, x-client-info, accept-profile, content-profile, prefer');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const match = req.url?.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  if (!match) return res.writeHead(404).end();
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const { status, body } = await callRpc(match[1], raw ? JSON.parse(raw) : {});
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(port, () => console.log(`Faux Supabase (RPC anon) : http://localhost:${port}`));
