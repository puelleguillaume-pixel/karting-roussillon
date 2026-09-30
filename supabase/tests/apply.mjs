// Applique stub + migrations + seed dans une instance PGlite et la renvoie.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function freshDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(`set timezone = 'UTC'`);
  const files = [
    join(root, 'tests', 'supabase_stub.sql'),
    ...readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'migrations', f)),
    ...(seed ? [join(root, 'seed.sql')] : []),
  ];
  for (const f of files) {
    try {
      await db.exec(readFileSync(f, 'utf8'));
    } catch (e) {
      const name = f.split(/[\/]/).pop();
      throw new Error(`${name}: ${e.message}${e.position ? ` (pos ${e.position})` : ''}${e.where ? `\n  ${e.where}` : ''}`);
    }
  }
  return db;
}

if (process.argv[1] && process.argv[1].endsWith('apply.mjs')) {
  const db = await freshDb();
  const r = await db.query(`select (select count(*) from public.products) products, (select count(*) from public.slots) slots,
                                   (select count(*) from public.slot_capacities) caps`);
  console.log('OK', r.rows[0]);
}
