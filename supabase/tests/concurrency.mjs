// Tests de concurrence sur un vrai PostgreSQL 17 (embedded-postgres), avec
// des connexions parallèles : ce que PGlite (mono-connexion) ne peut pas prouver.
// Usage : npm run db:test:concurrency
//
// Vérifie les verrous du moteur de réservation (SELECT … FOR UPDATE sur les
// créneaux, verrou consultatif par pilote, verrou du bon cadeau) :
//   - pas de surréservation quand des dizaines de clients visent le dernier kart ;
//   - un pilote ne peut pas être confirmé sur deux sessions simultanées ;
//   - un blocage et une réservation concurrents ne peuvent pas réussir tous deux
//     sans que la réservation soit signalée comme conflit ;
//   - un bon cadeau n'est jamais consommé au-delà de son solde.
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(join(tmpdir(), 'kr-pg-'));
const port = 54000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: (m) => process.env.KR_PG_LOG && console.log('[pg]', String(m).trim().slice(0, 300)), onError: (m) => process.env.KR_PG_LOG && console.log('[pg!]', String(m).trim().slice(0, 300)) });

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let pool;
try {
  console.log('Démarrage de PostgreSQL 17 (embarqué)…');
  await server.initialise();
  await server.start();
  await server.createDatabase('kr');
  pool = new pg.Pool({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'kr', max: 40 });
  pool.on('error', () => {});

  // Schéma : bouchon Supabase + migrations + seed (identiques à la production)
  const setup = await pool.connect();
  await setup.query(`set timezone = 'UTC'`);
  const files = [
    join(root, 'tests', 'supabase_stub.sql'),
    ...readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'migrations', f)),
    join(root, 'seed.sql'),
  ];
  for (const f of files) await setup.query(readFileSync(f, 'utf8'));
  setup.release();
  console.log(`Schéma appliqué (${files.length} fichiers).\n`);

  const STAFF = '00000000-0000-0000-0000-0000000000b1';
  await pool.query(`insert into auth.users (id, email) values ('${STAFF}', 'accueil@example.com');
                    insert into public.staff_roles (user_id, role, display_name) values ('${STAFF}', 'staff', 'Accueil')`);

  /** Une transaction « comme PostgREST » : rôle + utilisateur, sur sa propre connexion */
  async function as(role, uid, sql, params = []) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const { rows } = await client.query(sql, params);
      await client.query('commit');
      return rows;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  /** Transaction laissée ouverte (verrous tenus) : pour forcer un entrelacement précis */
  async function openTx(role, uid) {
    const client = await pool.connect();
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    return client;
  }
  /** Vrai si la requête est encore en attente après `ms` (bloquée par un verrou) */
  const stillWaiting = (promise, ms = 400) => Promise.race([promise.then(() => false, () => false), new Promise((r) => setTimeout(() => r(true), ms))]);
  const settle = (promises) => Promise.allSettled(promises);
  const ok = (results) => results.filter((r) => r.status === 'fulfilled');
  const ko = (results) => results.filter((r) => r.status === 'rejected');
  const codes = (results) => [...new Set(ko(results).map((r) => r.reason.message))];

  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const { id: P390 } = await one(`select id from public.products where slug = 'session-sodikart-390'`);
  const { id: C1 } = await one(`select id from public.tracks where slug = 'circuit-1'`);
  const slotAt = async (track, offsetDays, hhmm) =>
    (await one(`select sl.id from public.slots sl join public.tracks t on t.id = sl.track_id
                where t.slug = $1 and sl.starts_at = app.local_ts(app.local_date(now()) + $2::int, $3::time)`, [track, offsetDays, hhmm])).id;
  const person = (i) => ({ first_name: `Pilote${i}`, last_name: 'Course', birth_date: '1990-01-01' });
  const buyer = (i) => ({ first_name: `Client${i}`, last_name: 'Course', email: `client${i}@example.com`, phone: '0600000000' });
  const confirm = (holdToken, i, participants = [person(i)], gift = null) =>
    as('anon', null, `select public.confirm_booking($1, $2, $3, true, true, '', $4) r`, [holdToken, JSON.stringify(buyer(i)), JSON.stringify(participants), gift]);

  console.log('Concurrence (connexions parallèles)');

  await test('30 clients visent les 3 karts en ligne d’un créneau : exactement 3 réservations', async () => {
    const slot = await slotAt('circuit-1', 5, '10:00');
    const holds = await settle(Array.from({ length: 30 }, () => as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, slot])));
    assert(ok(holds).length === 3, `${ok(holds).length} blocages accordés au lieu de 3 (${codes(holds)})`);
    assert(codes(holds).every((c) => c === 'KR_SLOT_FULL'), `erreurs inattendues : ${codes(holds)}`);
    const confirmed = await settle(ok(holds).map((r, i) => confirm(r.value[0].h.hold_token, i)));
    assert(ok(confirmed).length === 3, `${ok(confirmed).length} confirmations`);
    const { n } = await one(`select coalesce(sum(bs.karts), 0)::int n from public.booking_sessions bs where bs.slot_id = $1`, [slot]);
    assert(n === 3, `${n} karts réservés sur le créneau`);
  });

  await test('comptoir : 12 saisies simultanées pour les 3 karts restants, jamais au-delà de la flotte', async () => {
    const slot = await slotAt('circuit-1', 5, '10:00');
    const results = await settle(
      Array.from({ length: 12 }, (_, i) =>
        as('authenticated', STAFF, `select public.admin_create_booking($1)`, [
          JSON.stringify({ product_id: P390, slot_ids: [slot], karts: 1, source: 'counter', customer: { first_name: 'Comptoir', last_name: `N${i}` }, participants: [] }),
        ]),
      ),
    );
    const { n, cap } = await one(
      `select (select coalesce(sum(bs.karts), 0) from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
               where bs.slot_id = $1 and b.status <> 'cancelled')::int n,
              (select capacity from public.slot_capacities sc join public.vehicle_types v on v.id = sc.vehicle_type_id
               where sc.slot_id = $1 and v.slug = 'sodikart-390')::int cap`,
      [slot],
    );
    assert(n === cap, `${n} karts réservés pour une capacité de ${cap}`);
    assert(ok(results).length === cap - 3, `${ok(results).length} saisies acceptées`);
  });

  await test('même pilote sur deux circuits à la même heure, confirmé en parallèle : une seule réservation', async () => {
    const [a, b] = [await slotAt('circuit-1', 6, '14:00'), await slotAt('circuit-2', 6, '14:00')];
    const [[{ h: h1 }], [{ h: h2 }]] = await Promise.all([
      as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, a]),
      as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, b]),
    ]);
    const twin = { first_name: 'Élodie', last_name: 'Double', birth_date: '1992-03-04' };
    const results = await settle([confirm(h1.hold_token, 101, [twin]), confirm(h2.hold_token, 102, [twin])]);
    assert(ok(results).length === 1, `${ok(results).length} réservations confirmées pour le même pilote`);
    assert(codes(results)[0] === 'KR_PILOT_OVERLAP', `erreur : ${codes(results)}`);
  });

  await test('blocage et réservation concurrents (10 essais) : jamais de réservation silencieuse dans un blocage', async () => {
    const outcomes = { booking: 0, block: 0 };
    for (let k = 0; k < 10; k++) {
      const clock = `${String(9 + k).padStart(2, '0')}:30`;
      const slot = await slotAt('circuit-1', 8, clock);
      const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, slot]);
      const range = await one(`select starts_at, ends_at from public.slots where id = $1`, [slot]);
      const [booking, block] = await settle([
        confirm(h.hold_token, 200 + k),
        as('authenticated', STAFF, `select public.admin_create_block($1)`, [
          JSON.stringify({ block_type: 'custom', starts_at: range.starts_at, ends_at: range.ends_at, track_ids: [C1], reason: 'weather' }),
        ]),
      ]);
      const both = booking.status === 'fulfilled' && block.status === 'fulfilled';
      assert(!both, `essai ${k} : réservation ET blocage créés sans arbitrage`);
      if (block.status === 'rejected') assert(block.reason.message === 'KR_BLOCK_HAS_CONFLICTS', `blocage : ${block.reason.message}`);
      if (booking.status === 'rejected') assert(booking.reason.message === 'KR_SLOT_BLOCKED', `réservation : ${booking.reason.message}`);
      outcomes[booking.status === 'fulfilled' ? 'booking' : 'block']++;
    }
    console.log(`      (réservation gagnante ${outcomes.booking} fois, blocage gagnant ${outcomes.block} fois)`);
  });

  await test('blocage validé pendant qu’un client confirme : la confirmation attend puis est refusée', async () => {
    const slot = await slotAt('circuit-1', 10, '11:00');
    const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, slot]);
    const range = await one(`select starts_at, ends_at from public.slots where id = $1`, [slot]);
    const tx = await openTx('authenticated', STAFF);
    await tx.query(`select public.admin_create_block($1)`, [
      JSON.stringify({ block_type: 'custom', starts_at: range.starts_at, ends_at: range.ends_at, track_ids: [C1], reason: 'weather' }),
    ]);
    const pending = confirm(h.hold_token, 400);
    assert(await stillWaiting(pending), 'la confirmation aurait dû attendre le verrou du créneau');
    await tx.query('commit');
    tx.release();
    const outcome = await pending.then(() => 'ok', (e) => e.message);
    assert(outcome === 'KR_SLOT_BLOCKED', `confirmation : ${outcome}`);
  });

  await test('réservation validée pendant la création d’un blocage : le blocage attend puis signale le conflit', async () => {
    const slot = await slotAt('circuit-1', 10, '15:00');
    const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, slot]);
    const range = await one(`select starts_at, ends_at from public.slots where id = $1`, [slot]);
    const tx = await openTx('anon', null);
    await tx.query(`select public.confirm_booking($1, $2, $3, true, true, '', null)`, [h.hold_token, JSON.stringify(buyer(401)), JSON.stringify([person(401)])]);
    const pending = as('authenticated', STAFF, `select public.admin_create_block($1)`, [
      JSON.stringify({ block_type: 'custom', starts_at: range.starts_at, ends_at: range.ends_at, track_ids: [C1], reason: 'weather' }),
    ]);
    assert(await stillWaiting(pending), 'le blocage aurait dû attendre le verrou du créneau');
    await tx.query('commit');
    tx.release();
    const outcome = await pending.then(() => 'ok', (e) => e.message);
    assert(outcome === 'KR_BLOCK_HAS_CONFLICTS', `blocage : ${outcome}`);
  });

  await test('bon cadeau de 30 € utilisé par 5 réservations simultanées : jamais plus que le solde', async () => {
    const [{ c }] = await as('authenticated', STAFF, `select public.admin_issue_gift_card($1) c`, [
      JSON.stringify({ kind: 'amount', amount_cents: 3000, payment: { method: 'cash' }, send_email: false }),
    ]);
    const slots = await Promise.all([10, 11, 12, 13, 14].map((h) => slotAt('circuit-2', 9, `${h}:00`)));
    const holds = await Promise.all(slots.map((s) => as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`, [P390, s])));
    const results = await settle(holds.map(([{ h }], i) => confirm(h.hold_token, 300 + i, [person(300 + i)], c.code)));
    const applied = ok(results).reduce((sum, r) => sum + r.value[0].r.gift_card_applied_cents, 0);
    const card = await one(`select balance_cents from public.gift_cards where id = $1`, [c.id]);
    assert(applied + card.balance_cents === 3000, `imputé ${applied} + solde ${card.balance_cents} ≠ 3000`);
    assert(card.balance_cents >= 0 && applied === 3000, `imputé ${applied}, solde ${card.balance_cents}`);
  });
} finally {
  await pool?.end().catch(() => {});
  await server.stop().catch(() => {});
  // Windows peut garder les fichiers verrouillés un instant après l'arrêt
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

console.log(`\n${passed} réussis, ${failures.length} échoués`);
process.exit(failures.length ? 1 : 0);
