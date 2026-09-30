/// <reference lib="webworker" />
// Base de démonstration : Postgres (PGlite) dans un Web Worker, persisté dans
// IndexedDB. Applique à la première ouverture exactement les mêmes migrations
// et le même seed que la production, puis les données d'exemple.
import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import seedSql from '../../../../supabase/seed.sql?raw';
import demoSql from '../../../../supabase/seed_demo.sql?raw';
import stubSql from '../../../../supabase/tests/supabase_stub.sql?raw';
import { DEMO_FLUSH_CHANNEL, DEMO_PROGRESS_CHANNEL, type DemoProgress } from './progress';

const migrationFiles = import.meta.glob<string>('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const migrations = Object.keys(migrationFiles)
  .sort()
  .map((path) => migrationFiles[path]!);

/** Horizon de créneaux réduit en démo (démarrage plus rapide dans le navigateur). */
const DEMO_SLOT_HORIZON_DAYS = 45;
const SLOT_GENERATION_CALL = 'select app.cron_generate_slots();';

// Appel d'une RPC « comme PostgREST » : rôle anon/authenticated, identifiant
// utilisateur dans request.jwt.claim.sub, erreur renvoyée en JSON (le canal
// du worker ne transmettrait que le message, sans le texte d'aide).
const CALL_AS_SQL = `
create schema if not exists demo;
grant usage on schema demo to anon, authenticated;
create or replace function demo.call_as(p_role text, p_uid text, p_sql text, p_args jsonb)
returns jsonb language plpgsql as $fn$
declare
  v_result jsonb;
  v_message text; v_hint text; v_detail text; v_code text;
begin
  if p_role not in ('anon', 'authenticated') then
    raise exception 'role non autorisé : %', p_role;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), true);
  perform set_config('role', p_role, true);
  begin
    execute p_sql into v_result using p_args;
    return jsonb_build_object('ok', true, 'result', v_result);
  exception when others then
    get stacked diagnostics v_message = message_text, v_hint = pg_exception_hint,
                            v_detail = pg_exception_detail, v_code = returned_sqlstate;
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('message', v_message, 'hint', v_hint, 'detail', v_detail, 'code', v_code));
  end;
end;
$fn$;
`;

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// Toute modification du SQL change la version, donc recrée une base neuve.
const version = fnv1a([stubSql, ...migrations, seedSql, demoSql, CALL_AS_SQL].join('\n--\n'));
const progress = new BroadcastChannel(DEMO_PROGRESS_CHANNEL);

// Avec relaxedDurability, PGlite copie ses fichiers vers IndexedDB en tâche de
// fond sans attendre le résultat. Pendant l'initialisation (écritures massives),
// une copie peut échouer ponctuellement (fichier supprimé entre deux passes) :
// la copie suivante rattrape, et la synchronisation finale est attendue
// explicitement. On masque donc uniquement ces rejets-là.
self.addEventListener('unhandledrejection', (event) => {
  if ((event.reason as { name?: unknown } | null)?.name === 'ErrnoError') event.preventDefault();
});
const report = (message: DemoProgress) => progress.postMessage(message);

async function dropStaleDatabases(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return;
  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .map((db) => db.name)
      .filter((name): name is string => !!name && name.includes('kr-demo-') && !name.includes(`kr-demo-${version}`))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }),
      ),
  );
}

function withDemoSlotHorizon(sql: string): string {
  if (!sql.includes(SLOT_GENERATION_CALL)) return sql;
  return sql.replace(
    SLOT_GENERATION_CALL,
    `update public.settings set value = '${DEMO_SLOT_HORIZON_DAYS}' where key = 'slot_generation_horizon_days';\n${SLOT_GENERATION_CALL}`,
  );
}

void worker({
  async init() {
    report({ step: 'open' });
    await dropStaleDatabases().catch(() => undefined);

    const db = await PGlite.create({
      dataDir: `idb://kr-demo-${version}`,
      relaxedDurability: true,
      postgresqlconf: "timezone = 'UTC'",
    });

    const { rows } = await db.query<{ installed: boolean }>(
      `select to_regclass('public.products') is not null as installed`,
    );
    if (!rows[0]?.installed) {
      report({ step: 'schema', done: 0, total: migrations.length });
      await db.exec(stubSql);
      for (const [index, migration] of migrations.entries()) {
        await db.exec(migration);
        report({ step: 'schema', done: index + 1, total: migrations.length });
      }
      report({ step: 'seed' });
      await db.exec(withDemoSlotHorizon(seedSql));
      await db.exec(demoSql);
      await db.exec(CALL_AS_SQL);
      await db.syncToFs();
    }

    // Ce que ferait pg_cron en production
    report({ step: 'maintenance' });
    await db.exec(`
      select app.cron_purge_holds();
      select app.cron_expire_gift_cards();
      select app.cron_complete_past_bookings();
      select app.cron_generate_slots()
       where coalesce((select max(starts_at) from public.slots), now()) < now() + interval '30 days';
    `);

    // Écriture durable à la demande : avec relaxedDurability, PGlite recopie la
    // base vers IndexedDB en tâche de fond sans attendre ; le client demande une
    // copie complète et attendue après chaque écriture (réservation, commande…),
    // pour qu'un rechargement immédiat de la page ne perde rien.
    const flush = new BroadcastChannel(DEMO_FLUSH_CHANNEL);
    let queue = Promise.resolve();
    flush.onmessage = (event: MessageEvent<{ id?: string }>) => {
      const id = event.data?.id;
      if (!id) return;
      queue = queue
        .then(() => db.fs?.syncToFs(false))
        .then(
          () => flush.postMessage({ id, ok: true }),
          () => flush.postMessage({ id, ok: false }),
        );
    };

    report({ step: 'ready' });
    return db;
  },
});
