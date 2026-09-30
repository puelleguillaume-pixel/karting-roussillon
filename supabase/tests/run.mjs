// Tests métier de la base (PGlite). Usage : npm run db:test
// Couvre : RLS, quotas en ligne / comptoir, contrôles âge / taille / chrono,
// chevauchement pilote, groupes de roulage, packs, blocages + conflits,
// récurrences, annulation / report, bons cadeaux, rôles owner / staff, exports.
//
// La concurrence réelle (FOR UPDATE, verrous consultatifs) est testée sur un
// vrai PostgreSQL par supabase/tests/concurrency.mjs (npm run db:test:concurrency).
import { freshDb } from './apply.mjs';

const db = await freshDb();
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
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  }
}

// Exécute une requête sous un rôle PostgREST (anon / authenticated) et un utilisateur
async function as(role, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    const r = await tx.query(sql, params);
    return r.rows;
  });
}
async function expectError(code, promise) {
  try {
    await promise;
  } catch (e) {
    assert(e.message.includes(code), `erreur attendue ${code}, obtenu : ${e.message}`);
    return e;
  }
  throw new Error(`erreur attendue ${code}, aucune levée`);
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// ---------------------------------------------------------------------------
// Jeu d'essai : utilisateurs, dates, identifiants
// ---------------------------------------------------------------------------
const OWNER = '00000000-0000-0000-0000-00000000000a';
const STAFF = '00000000-0000-0000-0000-00000000000b';
const CLIENT = '00000000-0000-0000-0000-00000000000c';
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${OWNER}', 'patron@example.com', now()), ('${STAFF}', 'accueil@example.com', now()),
    ('${CLIENT}', 'client@example.com', now());
  insert into public.staff_roles (user_id, role, display_name) values
    ('${OWNER}', 'owner', 'Dirigeant'), ('${STAFF}', 'staff', 'Accueil');
`);

const { d: DAY } = await one(`select (app.local_date(now()) + 5)::text as d`);
const { d: TODAY } = await one(`select app.local_date(now())::text as d`);
const { d: DAY2 } = await one(`select (app.local_date(now()) + 6)::text as d`);
const pid = async (slug) => (await one(`select id from public.products where slug = $1`, [slug])).id;
const tid = async (slug) => (await one(`select id from public.tracks where slug = $1`, [slug])).id;
const slotAt = async (track, day, hhmm) =>
  (await one(`select sl.id from public.slots sl join public.tracks t on t.id = sl.track_id
              where t.slug = $1 and sl.starts_at = app.local_ts($2::date, $3::time)`, [track, day, hhmm])).id;

const P390 = await pid('session-sodikart-390');
const P22 = await pid('session-sodikart-22cv');
const P160 = await pid('session-kart-160');
const PBI = await pid('session-biplace');
const PROTAX = await pid('pack-kr-rotax');
const C1 = await tid('circuit-1');
const C2 = await tid('circuit-2');

const adult = (first, last = 'Martin', birth = '1990-04-12') => ({ first_name: first, last_name: last, birth_date: birth });
const customer = { first_name: 'Julie', last_name: 'Martin', email: 'julie@example.com', phone: '0600000000' };

async function holdAndConfirm(product, slots, participants, extra = {}) {
  const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, $2::uuid[], $3) as h`,
    [product, slots, participants.filter((p) => (p.role ?? 'driver') === 'driver').length]);
  const [{ r }] = await as('anon', extra.uid ?? null,
    `select public.confirm_booking($1, $2, $3, true, true, '', $4) as r`,
    [h.hold_token, JSON.stringify(extra.customer ?? customer), JSON.stringify(participants), extra.gift ?? null]);
  return r;
}

// ---------------------------------------------------------------------------
console.log('\nSeed & catalogue');
// ---------------------------------------------------------------------------
await test('tarifs seedés à l\'identique', async () => {
  const rows = (await db.query(`select slug, price_cents from public.products where price_cents is not null order by slug`)).rows;
  const m = Object.fromEntries(rows.map((r) => [r.slug, r.price_cents]));
  eq([m['session-sodikart-22cv'], m['session-sodikart-30cv'], m['session-sodikart-390'], m['session-biplace'],
      m['session-handikart'], m['session-kart-160'], m['session-baby-kart'],
      m['pack-kr-160'], m['pack-kr-390'], m['pack-kr-biplace'], m['pack-kr-rotax']],
     [4000, 5000, 2400, 2500, 2000, 2000, 300, 5000, 6000, 6000, 10000], 'prix');
});
await test('créneaux 9h–19h heure de Paris, toutes les 15 min', async () => {
  const r = await one(`select min(to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI')) mn,
                              max(to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI')) mx, count(*)::int n
                       from public.slots where track_id = $1 and app.local_date(starts_at) = $2::date`, [C1, DAY]);
  eq([r.mn, r.mx, r.n], ['09:00', '18:45', 40], 'bornes');
});
await test('pas de créneaux sur le Circuit 3 (événements uniquement)', async () => {
  const r = await one(`select count(*)::int n from public.slots where track_id = $1`, [await tid('circuit-3')]);
  eq(r.n, 0, 'créneaux circuit 3');
});

// ---------------------------------------------------------------------------
console.log('\nSécurité (RLS & droits)');
// ---------------------------------------------------------------------------
await test('anon lit le catalogue', async () => {
  const r = await as('anon', null, `select count(*)::int n from public.products`);
  eq(r[0].n, 19, 'produits visibles');
});
await test('anon ne lit ni créneaux, ni clients, ni blocages, ni paiements', async () => {
  for (const t of ['slots', 'customers', 'schedule_blocks', 'payments', 'bookings', 'audit_log']) {
    await expectError('permission denied', as('anon', null, `select * from public.${t} limit 1`));
  }
});
await test('anon ne lit pas les paramètres privés', async () => {
  const r = await as('anon', null, `select key from public.settings where key = 'notify_email'`);
  eq(r.length, 0, 'notify_email masqué');
});
await test('anon ne voit pas customer_id des chronos', async () => {
  await expectError('permission denied', as('anon', null, `select customer_id from public.lap_records`));
  await as('anon', null, `select driver_name, lap_time_ms from public.lap_records`);
});
await test('anon ne peut pas exécuter une RPC admin', async () => {
  await expectError('permission denied', as('anon', null, `select public.admin_dashboard()`));
});
await test('un client connecté ne peut pas exécuter une RPC admin', async () => {
  await expectError('KR_FORBIDDEN', as('authenticated', CLIENT, `select public.admin_dashboard()`));
});
await test('staff : pas de paramètres, pas de CA, pas de catalogue', async () => {
  await expectError('KR_FORBIDDEN', as('authenticated', STAFF, `select public.admin_set_setting('hold_minutes', '5')`));
  await expectError('KR_FORBIDDEN', as('authenticated', STAFF, `select public.admin_sales_export(current_date, current_date)`));
  await expectError('KR_FORBIDDEN', as('authenticated', STAFF, `select public.admin_upsert_product('{"id":"${P390}","price_cents":1}')`));
  const [{ d }] = await as('authenticated', STAFF, `select public.admin_dashboard() d`);
  assert(!('revenue' in d), 'le staff ne doit pas voir le CA');
});
await test('owner : CA visible au tableau de bord', async () => {
  const [{ d }] = await as('authenticated', OWNER, `select public.admin_dashboard() d`);
  assert('revenue' in d, 'revenue absent');
});
await test('API site : bundle public sans paramètre privé ni contenu non publié', async () => {
  const [{ b }] = await as('anon', null, `select public.get_site_bundle() b`);
  eq(b.products.length, 19, 'produits');
  assert(!('notify_email' in b.settings) && !('default_online_quota_pct' in b.settings), 'paramètres privés exposés');
  assert(!('banner' in b.content) && !('legal.cgv' in b.content), 'contenu non publié exposé');
  assert(b.content['page.home']?.title, 'contenu de page manquant');
  assert(b.vehicle_types.every((v) => !('fleet_count' in v) && !('run_group' in v)), 'données internes de flotte exposées');
});
await test('API site : classement vide sans chronos publiés', async () => {
  const [{ l }] = await as('anon', null, `select public.get_leaderboard(10) l`);
  eq(l, [], 'classement');
});
await test('écriture directe interdite (tout passe par RPC)', async () => {
  await expectError('permission denied', as('authenticated', OWNER, `update public.products set price_cents = 1`));
});

// ---------------------------------------------------------------------------
console.log('\nDisponibilités & quotas');
// ---------------------------------------------------------------------------
const S14_C2 = await slotAt('circuit-2', DAY, '14:00');
const S14_C1 = await slotAt('circuit-1', DAY, '14:00');

await test('disponibilité 390 cc : quota en ligne 50 % (3 karts sur 6 par piste)', async () => {
  const rows = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P390, DAY]);
  const s = rows.find((r) => r.slot_id === S14_C2);
  eq(s.remaining, 3, 'reste en ligne');
  eq(new Set(rows.map((r) => r.track_name)).size, 2, 'deux pistes proposées');
});
await test('160 cc proposé uniquement là où la flotte est affectée (Circuit 1)', async () => {
  const rows = await as('anon', null, `select distinct track_name from public.get_availability($1, $2::date, 1)`, [P160, DAY]);
  eq(rows.map((r) => r.track_name), ['Circuit 1'], 'pistes');
});
await test('Baby Kart non réservable en ligne', async () => {
  await expectError('KR_PRODUCT_NOT_BOOKABLE',
    as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [await pid('session-baby-kart'), DAY]));
});
await test('hold au-delà du quota en ligne refusé', async () => {
  await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 3)`, [P390, S14_C2]);
  await expectError('KR_SLOT_FULL', as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1)`, [P390, S14_C2]));
});
await test('le comptoir peut encore utiliser la part walk-in', async () => {
  const [{ b }] = await as('authenticated', STAFF, `select public.admin_create_booking($1) b`, [JSON.stringify({
    product_id: P390, slot_ids: [S14_C2], karts: 3, source: 'counter',
    customer: { first_name: 'Paul', last_name: 'Comptoir' }, participants: [] })]);
  eq(b.status, 'confirmed', 'statut');
  await expectError('KR_SLOT_FULL', as('authenticated', STAFF, `select public.admin_create_booking($1)`, [JSON.stringify({
    product_id: P390, slot_ids: [S14_C2], karts: 1, source: 'counter', customer: { first_name: 'X', last_name: 'Y' } })]));
});
await test('purge des holds expirés : la capacité en ligne revient', async () => {
  await db.exec(`update public.booking_holds set expires_at = now() - interval '5 minutes'`);
  await db.query(`select app.cron_purge_holds()`);
  eq((await one(`select count(*)::int n from public.booking_holds`)).n, 0, 'holds restants');
  const rows = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P390, DAY]);
  // 6 karts, 3 pris au comptoir : reste en ligne = min(3 - 0, 6 - 3) = 3
  eq(rows.find((r) => r.slot_id === S14_C2).remaining, 3, 'reste en ligne');
});
await test('groupes de roulage : pas de 22 CV sur une session 390 cc', async () => {
  const rows = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P22, DAY]);
  const s = rows.find((r) => r.slot_id === S14_C2);
  eq([s.remaining, s.available], [0, false], '22 CV sur session loisir');
});

// ---------------------------------------------------------------------------
console.log('\nParcours de réservation & contrôles participants');
// ---------------------------------------------------------------------------
const S16_C1 = await slotAt('circuit-1', DAY, '16:00');
const S16_C2 = await slotAt('circuit-2', DAY, '16:00');
const yearsBefore = async (n, extraDays = 0) =>
  (await one(`select ($1::date - make_interval(years => $2) - make_interval(days => $3))::date::text d`, [DAY, n, extraDays])).d;
let julieBooking;

await test('réservation valide : confirmée, référence, email en file', async () => {
  julieBooking = await holdAndConfirm(P390, [S16_C1], [adult('Julie')]);
  assert(/^KR-[A-Z0-9]{6}$/.test(julieBooking.reference), 'référence');
  eq([julieBooking.total_cents, julieBooking.amount_due_cents], [2400, 2400], 'total / reste à payer sur place');
  const r = await one(`select count(*)::int n from public.email_outbox where payload->>'reference' = $1`, [julieBooking.reference]);
  eq(r.n, 1, 'email client (notify_email vide : pas de copie dirigeant)');
});
await test('âge minimum (13 ans sur 390 cc) refusé', async () => {
  await expectError('KR_AGE_TOO_LOW', holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '10:00')],
    [{ ...adult('Tom', 'Petit', await yearsBefore(13)), guardian_name: 'Julie Martin' }]));
});
await test('âge révolu au jour de la session (14 ans la veille : accepté)', async () => {
  await holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '10:15')],
    [{ ...adult('Léo', 'Juste', await yearsBefore(14, 1)), guardian_name: 'Anne Juste' }]);
});
await test('taille : 160 cc sans taille ni certification refusé', async () => {
  await expectError('KR_HEIGHT_REQUIRED', holdAndConfirm(P160, [await slotAt('circuit-1', DAY, '11:00')],
    [{ ...adult('Nina', 'Kid', await yearsBefore(9)), guardian_name: 'Mère Kid' }]));
});
await test('taille mesurée insuffisante refusée', async () => {
  await expectError('KR_HEIGHT_TOO_LOW', holdAndConfirm(P160, [await slotAt('circuit-1', DAY, '11:15')],
    [{ ...adult('Nina', 'Kid', await yearsBefore(9)), height_cm: 120, guardian_name: 'Mère Kid' }]));
});
await test('mineur sans représentant légal refusé', async () => {
  await expectError('KR_GUARDIAN_REQUIRED', holdAndConfirm(P160, [await slotAt('circuit-1', DAY, '11:30')],
    [{ ...adult('Nina', 'Kid', await yearsBefore(9)), height_certified: true }]));
});
await test('biplace : passager de 3 ans refusé, passager de 6 ans accepté', async () => {
  const driver = adult('Marc', 'Duo', '1980-01-01');
  await expectError('KR_PASSENGER_AGE_TOO_LOW', holdAndConfirm(PBI, [await slotAt('circuit-1', DAY, '12:00')],
    [driver, { ...adult('Bébé', 'Duo', await yearsBefore(3)), role: 'passenger', height_cm: 100, guardian_name: 'Marc Duo' }]));
  await holdAndConfirm(PBI, [await slotAt('circuit-1', DAY, '12:15')],
    [driver, { ...adult('Lou', 'Duo', await yearsBefore(6)), role: 'passenger', height_cm: 110, guardian_name: 'Marc Duo' }]);
});
await test('un pilote ne peut pas être sur deux sessions simultanées', async () => {
  await expectError('KR_PILOT_OVERLAP', holdAndConfirm(P22, [S16_C2], [adult('Julie')]));
});
await test('participant saisi deux fois (accents/casse) refusé', async () => {
  await expectError('KR_DUPLICATE_PARTICIPANT', holdAndConfirm(P390, [await slotAt('circuit-2', DAY, '17:00')],
    [adult('Zoé', 'Double'), adult('ZOE', 'double')]));
});
await test('décharge obligatoire', async () => {
  const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`,
    [P390, await slotAt('circuit-2', DAY, '17:15')]);
  await expectError('KR_WAIVER_REQUIRED', as('anon', null, `select public.confirm_booking($1, $2, $3, true, false)`,
    [h.hold_token, JSON.stringify(customer), JSON.stringify([adult('Eva')])]));
});
await test('hold expiré refusé à la confirmation', async () => {
  const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1) h`,
    [P390, await slotAt('circuit-2', DAY, '17:30')]);
  await db.query(`update public.booking_holds set expires_at = now() - interval '1 second' where hold_token = $1`, [h.hold_token]);
  await expectError('KR_HOLD_EXPIRED', as('anon', null, `select public.confirm_booking($1, $2, $3, true, true)`,
    [h.hold_token, JSON.stringify(customer), JSON.stringify([adult('Eva')])]));
});
await test('créneau trop proche du départ refusé en ligne', async () => {
  // Délai minimal porté juste au-delà du prochain créneau (test indépendant de l'heure d'exécution)
  const s = await one(`select sl.id, ceil(extract(epoch from sl.starts_at - now()) / 60)::int + 5 as lead
                       from public.slots sl where sl.track_id = $1 and sl.starts_at > now() order by sl.starts_at limit 1`, [C1]);
  await db.query(`update public.settings set value = to_jsonb($1::int) where key = 'booking_min_lead_minutes'`, [s.lead]);
  try {
    await expectError('KR_SLOT_TOO_SOON', as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1)`, [P390, s.id]));
  } finally {
    await db.query(`update public.settings set value = '30' where key = 'booking_min_lead_minutes'`);
  }
});

// ---------------------------------------------------------------------------
console.log('\nPacks & validation chrono');
// ---------------------------------------------------------------------------
const R10 = await slotAt('circuit-2', DAY2, '10:00');
const R1015 = await slotAt('circuit-2', DAY2, '10:15');
const R1030 = await slotAt('circuit-2', DAY2, '10:30');
let rotaxBooking;
await test('pack : nombre de créneaux imposé', async () => {
  await expectError('KR_SLOT_COUNT', as('anon', null, `select public.create_booking_hold($1, $2::uuid[], 1)`, [PROTAX, [R10, R1015]]));
});
await test('pack : sessions simultanées refusées', async () => {
  const other = await slotAt('circuit-1', DAY2, '10:00');
  await expectError('KR_PACK_OVERLAP', as('anon', null, `select public.create_booking_hold($1, $2::uuid[], 1)`,
    [await pid('pack-kr-390'), [R10, other, R1030]]));
});
await test('Pack Rotax sans validation chrono refusé', async () => {
  await expectError('KR_CHRONO_VALIDATION_REQUIRED', holdAndConfirm(PROTAX, [R10, R1015, R1030], [adult('Marc', 'Pilote', '1985-01-01')]));
});
await test('validation chrono par le staff puis Pack Rotax accepté', async () => {
  const c = await one(`insert into public.customers (email, first_name, last_name, birth_date)
                       values ('marc@example.com', 'Marc', 'Pilote', '1985-01-01') returning id`);
  await as('authenticated', STAFF, `select public.admin_set_chrono_validation($1, true)`, [c.id]);
  rotaxBooking = await holdAndConfirm(PROTAX, [R10, R1015, R1030], [adult('Marc', 'Pilote', '1985-01-01')],
    { customer: { first_name: 'Marc', last_name: 'Pilote', email: 'marc@example.com', phone: '0611111111' } });
  eq(rotaxBooking.total_cents, 10000, 'prix pack');
  const r = await one(`select count(*)::int n from public.booking_sessions where booking_id = $1`, [rotaxBooking.booking_id]);
  eq(r.n, 3, 'sessions');
});

// ---------------------------------------------------------------------------
console.log('\nBlocages & privatisations');
// ---------------------------------------------------------------------------
const counterBooking = await one(`select b.id from public.bookings b join public.booking_sessions bs on bs.booking_id = b.id
                                  where bs.slot_id = $1 and b.source = 'counter'`, [S14_C2]);
const afternoonC2 = { block_type: 'afternoon', date: DAY, track_ids: [C2], reason: 'weather' };
let blockSeries;
await test('aperçu : conflits listés avant validation', async () => {
  const [{ p }] = await as('authenticated', STAFF, `select public.admin_preview_block($1) p`, [JSON.stringify(afternoonC2)]);
  eq(p.occurrences.length, 1, 'occurrences');
  assert(p.conflicts.some((c) => c.booking_id === counterBooking.id), 'réservation comptoir en conflit');
});
await test('création refusée tant qu\'aucune action n\'est choisie', async () => {
  await expectError('KR_BLOCK_HAS_CONFLICTS', as('authenticated', STAFF, `select public.admin_create_block($1)`, [JSON.stringify(afternoonC2)]));
});
await test('blocage après-midi Circuit 2 (météo) + report demandé aux clients', async () => {
  const [{ r }] = await as('authenticated', STAFF, `select public.admin_create_block($1, $2) r`, [
    JSON.stringify({ ...afternoonC2, is_public: true, public_label: 'Circuit 2 fermé (météo)' }),
    JSON.stringify({ default: 'reschedule' })]);
  blockSeries = r.series_id;
  eq((await one(`select status from public.bookings where id = $1`, [counterBooking.id])).status, 'reschedule_required', 'statut');
});
await test('créneaux bloqués indisponibles, uniquement sur la piste ciblée', async () => {
  const rows = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P390, DAY]);
  const pm = (await db.query(`select id from public.slots where track_id = $1
                               and starts_at >= app.local_ts($2::date, '13:00') and starts_at < app.local_ts($2::date, '19:00')`,
                             [C2, DAY])).rows.map((r) => r.id);
  eq(rows.filter((r) => pm.includes(r.slot_id)).length, 0, 'Circuit 2 après-midi');
  assert(rows.some((r) => r.track_name === 'Circuit 2'), 'Circuit 2 matin toujours ouvert');
  assert(rows.some((r) => r.slot_id === S14_C1), 'Circuit 1 toujours ouvert');
  await expectError('KR_SLOT_BLOCKED', as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 1)`,
    [P390, await slotAt('circuit-2', DAY, '15:00')]));
});
await test('blocage public visible au calendrier', async () => {
  const rows = await as('anon', null, `select * from public.get_public_calendar($1::date, $1::date)`, [DAY]);
  assert(rows.some((r) => r.item_type === 'block' && r.title === 'Circuit 2 fermé (météo)'), 'blocage public');
});
await test('suppression du blocage : réouverture immédiate', async () => {
  const b = await one(`select id from public.schedule_blocks where series_id = $1`, [blockSeries]);
  await as('authenticated', STAFF, `select public.admin_delete_block($1)`, [b.id]);
  const rows = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P390, DAY]);
  assert(rows.some((r) => r.slot_id === S16_C2), 'Circuit 2 après-midi rouvert');
});
await test('report par le client (lien email) après blocage', async () => {
  const tok = (await one(`select qr_token from public.bookings where id = $1`, [counterBooking.id])).qr_token;
  const [{ g }] = await as('anon', null, `select public.get_booking_by_token($1) g`, [tok]);
  eq(g.can_reschedule, true, 'report possible');
  const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], 3) h`,
    [P390, await slotAt('circuit-1', DAY2, '15:00')]);
  const [{ r }] = await as('anon', null, `select public.reschedule_booking_by_token($1, $2) r`, [tok, h.hold_token]);
  eq([r.status, r.booking_date], ['confirmed', DAY2], 'statut et date après report');
});
await test('récurrence : tous les mardis matin sur 4 semaines', async () => {
  const [{ p }] = await as('authenticated', STAFF, `select public.admin_preview_block($1) p`, [JSON.stringify({
    block_type: 'morning', date: '2026-11-03', track_ids: [C1], reason: 'maintenance',
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261124' })]);
  eq(p.occurrences.length, 4, 'occurrences');
  const hours = await db.query(`select to_char((x->>'starts_at')::timestamptz at time zone 'Europe/Paris', 'HH24:MI') h
                                from jsonb_array_elements($1::jsonb) x`, [JSON.stringify(p.occurrences)]);
  assert(hours.rows.every((r) => r.h === '09:00'), 'toutes à 9h locales');
});
await test('récurrence : heure locale conservée au changement d\'heure (25/10)', async () => {
  const r = await db.query(`select to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI') h
                            from app.expand_rrule(app.local_ts('2026-10-22', '09:00'), app.local_ts('2026-10-22', '13:00'), 'FREQ=DAILY;COUNT=6')`);
  eq(r.rows.map((x) => x.h), Array(6).fill('09:00'), 'heures');
});
await test('privatisation de tout le site + annulation des réservations impactées', async () => {
  const [{ r }] = await as('authenticated', OWNER, `select public.admin_create_block($1, $2) r`, [JSON.stringify({
    block_type: 'custom', starts_at: `${DAY2}T07:00:00Z`, ends_at: `${DAY2}T09:00:00Z`, all_tracks: true,
    reason: 'private_event', internal_note: 'Séminaire' }), JSON.stringify({ default: 'cancel' })]);
  assert(r.conflicts.some((c) => c.booking_id === rotaxBooking.booking_id && c.action === 'cancel'), 'pack Rotax annulé');
  const b = await one(`select status, cancellation_outcome from public.bookings where id = $1`, [rotaxBooking.booking_id]);
  eq([b.status, b.cancellation_outcome], ['cancelled', 'full_refund'], 'annulation circuit');
});
let eventId;
await test('conversion d\'un blocage en trackday vendable', async () => {
  const [{ r }] = await as('authenticated', STAFF, `select public.admin_create_block($1) r`, [JSON.stringify({
    block_type: 'full_day', date: '2026-11-15', track_ids: [await tid('circuit-3')], reason: 'trackday' })]);
  const [{ e }] = await as('authenticated', STAFF, `select public.admin_convert_block_to_event($1, $2) e`, [r.block_ids[0], JSON.stringify({
    title: 'Trackday moto', category: 'moto', capacity: 2, price_cents: 15000, is_published: true, is_bookable: true })]);
  eventId = e;
  const rows = await as('anon', null, `select * from public.get_public_calendar('2026-11-15', '2026-11-15')`);
  assert(rows.some((x) => x.item_type === 'event' && x.title === 'Trackday moto' && x.places_left === 2), 'événement public');
  assert(!rows.some((x) => x.item_type === 'block'), 'pas de doublon blocage / événement');
});
await test('places trackday : réservation puis complet', async () => {
  const riders = [{ ...adult('Ana', 'Moto'), extra: { bike: 'Yamaha R6' } }, adult('Ben', 'Moto')];
  const [{ r }] = await as('anon', null, `select public.book_event($1, $2, $3, true, true) r`,
    [eventId, JSON.stringify(customer), JSON.stringify(riders)]);
  eq(r.total_cents, 30000, 'total');
  await expectError('KR_EVENT_FULL', as('anon', null, `select public.book_event($1, $2, $3, true, true)`,
    [eventId, JSON.stringify(customer), JSON.stringify([adult('Cid', 'Moto')])]));
});

// ---------------------------------------------------------------------------
console.log('\nAnnulation client');
// ---------------------------------------------------------------------------
await test('annulation > 48 h : remboursement intégral', async () => {
  const [{ r }] = await as('anon', null, `select public.cancel_booking_by_token($1) r`, [julieBooking.qr_token]);
  eq(r.outcome, 'full_refund', 'issue');
});
await test('annulation entre 24 h et 48 h après encaissement : avoir émis', async () => {
  const b = await holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '17:00')], [adult('Hugo', 'Avoir')]);
  await as('authenticated', STAFF, `select public.admin_record_payment($1)`,
    [JSON.stringify({ booking_id: b.booking_id, amount_cents: 2400, method: 'card' })]);
  await db.query(`update public.bookings set starts_at = now() + interval '30 hours' where id = $1`, [b.booking_id]);
  const [{ r }] = await as('anon', null, `select public.cancel_booking_by_token($1) r`, [b.qr_token]);
  eq(r.outcome, 'credit', 'issue');
  assert(/^KDO-/.test(r.credit_code) && r.credit_amount_cents === 2400, 'avoir de 24 €');
});
await test('annulation < 24 h refusée en ligne', async () => {
  const b = await holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '17:15')], [adult('Iris', 'Tard')]);
  await db.query(`update public.bookings set starts_at = now() + interval '10 hours' where id = $1`, [b.booking_id]);
  await expectError('KR_CANCELLATION_TOO_LATE', as('anon', null, `select public.cancel_booking_by_token($1)`, [b.qr_token]));
});

// ---------------------------------------------------------------------------
console.log('\nBons cadeaux');
// ---------------------------------------------------------------------------
let gift;
await test('émission par le staff avec encaissement', async () => {
  const [{ g }] = await as('authenticated', STAFF, `select public.admin_issue_gift_card($1) g`, [JSON.stringify({
    kind: 'amount', amount_cents: 5000, recipient_name: 'Sam', recipient_email: 'sam@example.com', payment: { method: 'cash' } })]);
  gift = g;
  assert(/^KDO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(g.code), 'format du code');
  const [{ c }] = await as('anon', null, `select public.check_gift_card($1) c`, [g.code.toLowerCase()]);
  eq([c.status, c.balance_cents], ['active', 5000], 'solde');
});
let giftBooking;
await test('réservation réglée par bon cadeau (solde suivi)', async () => {
  giftBooking = await holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '18:00')],
    [adult('Sam', 'Kdo'), adult('Max', 'Kdo')], { gift: gift.code });
  eq([giftBooking.gift_card_applied_cents, giftBooking.amount_due_cents], [4800, 0], 'imputation');
  eq((await one(`select balance_cents from public.gift_cards where id = $1`, [gift.id])).balance_cents, 200, 'solde restant');
});
await test('bon « produit » refusé sur un autre produit', async () => {
  const [{ g }] = await as('authenticated', STAFF, `select public.admin_issue_gift_card($1) g`, [JSON.stringify({
    kind: 'product', product_id: P22, payment: { method: 'card' } })]);
  eq(g.initial_amount_cents, 4000, 'valeur = prix du produit');
  await expectError('KR_GIFT_CARD_WRONG_PRODUCT', holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '18:15')],
    [adult('Kim', 'Kdo')], { gift: g.code }));
});
await test('annulation : bon recrédité', async () => {
  await as('anon', null, `select public.cancel_booking_by_token($1)`, [giftBooking.qr_token]);
  eq((await one(`select balance_cents from public.gift_cards where id = $1`, [gift.id])).balance_cents, 5000, 'solde');
});
await test('code inconnu refusé', async () => {
  await expectError('KR_GIFT_CARD_INVALID', as('anon', null, `select public.check_gift_card('KDO-AAAA-BBBB-CCCC')`));
});

// ---------------------------------------------------------------------------
console.log('\nDemandes, compte client, RGPD, exports');
// ---------------------------------------------------------------------------
await test('demande anniversaire → devis + blocage de planning lié', async () => {
  const [{ r }] = await as('anon', null, `select public.submit_request('birthday', $1, $2) r`, [JSON.stringify(customer),
    JSON.stringify({ preferred_date: DAY2, participants_count: 8, message: '10 ans de Lina', age_range: '8-10' })]);
  assert(/^DM-/.test(r.reference), 'référence');
  const [{ u }] = await as('authenticated', STAFF, `select public.admin_update_request($1, $2) u`, [r.request_id, JSON.stringify({
    status: 'quoted', quote_amount_cents: 18000,
    block: { block_type: 'custom', starts_at: `${DAY2}T12:00:00Z`, ends_at: `${DAY2}T14:00:00Z`, track_ids: [C1], reason: 'private_event' },
    conflict_actions: { default: 'keep' } })]);
  eq(u.status, 'quoted', 'statut');
  const b = await one(`select b.request_id from public.schedule_blocks b join public.requests r on r.schedule_block_id = b.id where r.id = $1`, [r.request_id]);
  eq(b.request_id, r.request_id, 'blocage lié à la demande');
});
await test('anti-spam : 5 demandes par heure et par email', async () => {
  for (let i = 0; i < 4; i++) {
    await as('anon', null, `select public.submit_request('other', $1, '{}')`, [JSON.stringify(customer)]);
  }
  await expectError('KR_RATE_LIMITED', as('anon', null, `select public.submit_request('other', $1, '{}')`, [JSON.stringify(customer)]));
});
await test('compte client : rattachement par email vérifié et RLS', async () => {
  await holdAndConfirm(P390, [await slotAt('circuit-1', DAY, '13:00')], [adult('Chloé', 'Client')],
    { uid: CLIENT, customer: { first_name: 'Chloé', last_name: 'Client', email: 'client@example.com', phone: '0622222222' } });
  const [{ m }] = await as('authenticated', CLIENT, `select public.my_bookings() m`);
  eq(m.length, 1, 'mes réservations');
  const rows = await as('authenticated', CLIENT, `select count(*)::int n from public.bookings`);
  eq(rows[0].n, 1, 'RLS : uniquement les siennes');
});
await test('un parcours anonyme ne modifie pas une fiche existante', async () => {
  await holdAndConfirm(P390, [await slotAt('circuit-1', DAY2, '16:00')], [adult('Pirate')],
    { customer: { first_name: 'Pirate', last_name: 'Pirate', email: 'client@example.com', phone: '0699999999' } });
  const c = await one(`select first_name, phone from public.customers where email = 'client@example.com'`);
  eq([c.first_name, c.phone], ['Chloé', '0622222222'], 'fiche intacte');
});
await test('RGPD : export puis anonymisation', async () => {
  const c = await one(`select id from public.customers where email = 'marc@example.com'`);
  const [{ e }] = await as('authenticated', OWNER, `select public.admin_export_customer($1) e`, [c.id]);
  assert(e.bookings.length >= 1, 'export contient les réservations');
  await as('authenticated', OWNER, `select public.admin_anonymize_customer($1)`, [c.id]);
  const a = await one(`select email, first_name from public.customers where id = $1`, [c.id]);
  eq([a.email, a.first_name], [null, 'Anonyme'], 'anonymisé');
});
await test('export comptable : ventes, bons (PCA) et consommations', async () => {
  const rows = await as('authenticated', OWNER, `select * from public.admin_sales_export($1::date, $1::date)`, [TODAY]);
  const types = new Set(rows.map((r) => r.line_type));
  for (const t of ['sale', 'gift_card_sale', 'gift_card_redemption']) assert(types.has(t), `ligne ${t} absente`);
  const sale = rows.find((r) => r.line_type === 'sale');
  eq([sale.amount_ttc_cents, sale.vat_cents, sale.amount_ht_cents], [2400, 400, 2000], 'ventilation TVA 20 %');
  assert(rows.find((r) => r.line_type === 'gift_card_sale' && r.amount_ttc_cents === 5000).is_deferred, 'bon polyvalent = PCA');
});
await test('synthèse bons cadeaux', async () => {
  const [{ s }] = await as('authenticated', OWNER, `select public.admin_gift_card_summary($1::date, $1::date) s`, [TODAY]);
  assert(s.issued_cents >= 5000 + 4000 + 2400, `émis : ${s.issued_cents}`);
});
await test('planning admin (vue semaine)', async () => {
  const [{ p }] = await as('authenticated', STAFF, `select public.admin_planning($1::date, $1::date + 6, null) p`, [DAY]);
  assert(p.slots.length > 0 && p.bookings.length > 0 && p.blocks.length > 0, 'contenu');
});
await test('journal d\'audit alimenté', async () => {
  const r = await one(`select count(*)::int n, count(distinct action)::int a from public.audit_log`);
  assert(r.n > 10 && r.a > 8, `entrées : ${r.n}`);
});
// ---------------------------------------------------------------------------
console.log('\nParcours front, compte client, file d\'emails');
// ---------------------------------------------------------------------------
await test('décharge en vigueur lisible par le site', async () => {
  const [{ w }] = await as('anon', null, `select public.get_current_waiver() w`);
  eq(w.version, 1, 'version');
});
await test('fiche publique d\'un événement avec places restantes', async () => {
  const { slug } = await one(`select slug from public.events where id = $1`, [eventId]);
  const [{ e }] = await as('anon', null, `select public.get_event_public($1) e`, [slug]);
  eq([e.title, e.places_left, e.is_bookable], ['Trackday moto', 0, true], 'événement');
  eq(e.tracks.map((t) => t.slug), ['circuit-3'], 'pistes');
});
await test('profil du client connecté', async () => {
  const [{ p }] = await as('authenticated', CLIENT, `select public.my_profile() p`);
  eq([p.first_name, p.email], ['Chloé', 'client@example.com'], 'profil');
  const [{ g }] = await as('authenticated', CLIENT, `select public.my_gift_cards() g`);
  eq(g, [], 'bons');
});
await test('file d\'emails : réservée au service (Edge Function)', async () => {
  await expectError('permission denied', as('anon', null, `select * from public.email_claim_batch(5)`));
  await expectError('permission denied', as('authenticated', OWNER, `select * from public.email_claim_batch(5)`));
});
await test('file d\'emails : réservation, succès, nouvel essai différé', async () => {
  await db.exec(`update public.email_outbox set status = 'sent' where status = 'pending'`);
  await db.query(`select app.enqueue_email('booking_confirmation', 'a@example.com', '{}'::jsonb)`);
  await db.query(`select app.enqueue_email('booking_confirmation', 'b@example.com', '{}'::jsonb)`);
  const batch = await as('service_role', null, `select id, to_email, status, attempts from public.email_claim_batch(10) order by to_email`);
  eq(batch.map((r) => [r.to_email, r.status, r.attempts]), [['a@example.com', 'sending', 1], ['b@example.com', 'sending', 1]], 'lot');
  eq((await as('service_role', null, `select * from public.email_claim_batch(10)`)).length, 0, 'pas de double prise');
  await as('service_role', null, `select public.email_mark_result($1, true)`, [batch[0].id]);
  await as('service_role', null, `select public.email_mark_result($1, false, 'Apps Script indisponible')`, [batch[1].id]);
  const rows = await db.query(`select to_email, status, last_error, send_after > now() as later from public.email_outbox where id = any($1::uuid[]) order by to_email`,
    [[batch[0].id, batch[1].id]]);
  eq(rows.rows.map((r) => [r.status, r.later]), [['sent', false], ['pending', true]], 'résultats');
});
// ---------------------------------------------------------------------------
console.log('\nBons cadeaux : commande en ligne et activation');
// ---------------------------------------------------------------------------
const buyer = { first_name: 'Chloé', last_name: 'Client', email: 'client@example.com', phone: '0622222222' };
let order;
await test('commande « montant » : en attente de règlement, code non communiqué', async () => {
  const [{ r }] = await as('authenticated', CLIENT, `select public.order_gift_card($1) r`, [JSON.stringify({
    kind: 'amount', amount_cents: 5000, recipient_name: 'Léa', recipient_email: 'lea@example.com', deliver_to: 'recipient',
    message: 'Joyeux anniversaire !', buyer, accept_terms: true })]);
  order = r;
  assert(/^BC-[A-Z0-9]{6}$/.test(r.order_reference), 'référence de commande');
  assert(!('code' in r), 'le code ne doit pas être renvoyé');
  const card = await one(`select id, code, status, deliver_to, created_by from public.gift_cards where order_reference = $1`, [r.order_reference]);
  eq([card.status, card.deliver_to, card.created_by], ['pending_payment', 'recipient', null], 'état (created_by réservé au personnel)');
  order.id = card.id;
  order.code = card.code;
  await expectError('KR_GIFT_CARD_INVALID', as('anon', null, `select public.check_gift_card($1)`, [card.code]));
  const mails = await db.query(`select template from public.email_outbox where payload->>'order_reference' = $1`, [r.order_reference]);
  eq(mails.rows.map((m) => m.template), ['gift_card_ordered'], 'email de commande (dirigeant non configuré)');
});
await test('compte client : commande visible, code masqué avant règlement', async () => {
  const [{ g }] = await as('authenticated', CLIENT, `select public.my_gift_cards() g`);
  const mine = g.find((c) => c.order_reference === order.order_reference);
  eq([mine.status, mine.code], ['pending_payment', null], 'bon en attente');
});
await test('commande : montant hors limites et envoi direct sans email refusés', async () => {
  await expectError('KR_GIFT_CARD_AMOUNT', as('anon', null, `select public.order_gift_card($1)`, [JSON.stringify({
    kind: 'amount', amount_cents: 500, recipient_name: 'Léa', buyer, accept_terms: true })]));
  await expectError('KR_GIFT_CARD_DELIVERY', as('anon', null, `select public.order_gift_card($1)`, [JSON.stringify({
    kind: 'amount', amount_cents: 5000, recipient_name: 'Léa', deliver_to: 'recipient', buyer, accept_terms: true })]));
  await expectError('KR_TERMS_REQUIRED', as('anon', null, `select public.order_gift_card($1)`, [JSON.stringify({
    kind: 'amount', amount_cents: 5000, recipient_name: 'Léa', buyer })]));
});
await test('commande « activité » : valeur = prix du produit', async () => {
  const [{ r }] = await as('anon', null, `select public.order_gift_card($1) r`, [JSON.stringify({
    kind: 'product', product_id: await pid('pack-kr-390'), recipient_name: 'Max', buyer: { ...buyer, email: 'autre@example.com' }, accept_terms: true })]);
  eq([r.amount_cents, r.product], [6000, 'Pack KR 390 cc'], 'valeur');
});
await test('activation à l\'encaissement : bon actif, paiement et emails acheteur + bénéficiaire', async () => {
  const [{ c }] = await as('authenticated', STAFF, `select public.admin_activate_gift_card($1, 'card') c`, [order.id]);
  eq(c.status, 'active', 'statut');
  const [{ k }] = await as('anon', null, `select public.check_gift_card($1) k`, [order.code]);
  eq([k.status, k.balance_cents], ['active', 5000], 'solde');
  const mails = await db.query(`select to_email, payload->>'audience' as audience from public.email_outbox
                                where template = 'gift_card_issued' and payload->>'code' = $1 order by to_email`, [order.code]);
  eq(mails.rows.map((m) => [m.to_email, m.audience]), [['client@example.com', 'buyer'], ['lea@example.com', 'recipient']], 'destinataires');
  const pay = await one(`select amount_cents, vat_rate_bp from public.payments where gift_card_id = $1`, [order.id]);
  eq([pay.amount_cents, pay.vat_rate_bp], [5000, 0], 'encaissement (bon polyvalent : TVA à l\'utilisation)');
});
await test('trackday réglé en partie par bon cadeau ; bon « activité » refusé', async () => {
  const [{ e }] = await as('authenticated', STAFF, `select public.admin_upsert_event($1) e`, [JSON.stringify({
    slug: 'test-trackday-bon', title: 'Trackday test', kind: 'trackday', category: 'auto',
    starts_at: `${await (async () => (await one(`select (app.local_date(now()) + 20)::text d`)).d)()}T07:00:00Z`,
    ends_at: `${await (async () => (await one(`select (app.local_date(now()) + 20)::text d`)).d)()}T16:00:00Z`,
    capacity: 5, price_cents: 12000, is_published: true, is_bookable: true })]);
  const [{ r }] = await as('anon', null, `select public.book_event($1, $2, $3, true, true, '', $4) r`,
    [e, JSON.stringify(customer), JSON.stringify([adult('Rémi', 'Piste')]), order.code]);
  eq([r.gift_card_applied_cents, r.amount_due_cents], [5000, 7000], 'imputation');
  const productCard = await one(`select code from public.gift_cards where kind = 'product' and status = 'active' limit 1`);
  await expectError('KR_GIFT_CARD_WRONG_PRODUCT', as('anon', null, `select public.book_event($1, $2, $3, true, true, '', $4)`,
    [e, JSON.stringify(customer), JSON.stringify([adult('Sam', 'Piste')]), productCard.code]));
});
await test('tâches planifiées exécutables', async () => {
  for (const f of ['cron_purge_holds', 'cron_enqueue_reminders', 'cron_expire_gift_cards', 'cron_complete_past_bookings', 'cron_prune_outbox']) {
    await db.query(`select app.${f}()`);
  }
});

console.log('\nEspace dirigeant : lectures et saisie comptoir');
await test('lectures admin refusées aux clients et aux anonymes', async () => {
  for (const fn of ['admin_list_bookings()', 'admin_list_customers()', 'admin_list_gift_cards()', 'admin_list_requests()', 'admin_catalog()']) {
    await expectError('KR_FORBIDDEN', as('authenticated', CLIENT, `select public.${fn}`));
  }
  await expectError('permission denied', as('anon', null, `select public.admin_list_bookings()`));
});
await test('paramètres, équipe et journal réservés au dirigeant', async () => {
  for (const fn of ['admin_settings()', 'admin_list_staff()', 'admin_list_audit()']) {
    await expectError('KR_FORBIDDEN', as('authenticated', STAFF, `select public.${fn}`));
    await as('authenticated', OWNER, `select public.${fn}`);
  }
});
await test('liste des réservations : recherche, filtres, pagination', async () => {
  const [{ r: all }] = await as('authenticated', STAFF, `select public.admin_list_bookings('{"limit": 2}') r`);
  assert(all.total >= 3 && all.rows.length === 2, `pagination (${all.total})`);
  const ref = all.rows[0].reference;
  const [{ r: byRef }] = await as('authenticated', STAFF, `select public.admin_list_bookings($1) r`, [JSON.stringify({ q: ref.toLowerCase() })]);
  eq(byRef.rows.map((b) => b.reference), [ref], 'recherche par référence');
  const [{ r: cancelled }] = await as('authenticated', STAFF, `select public.admin_list_bookings('{"status": ["cancelled"]}') r`);
  assert(cancelled.rows.every((b) => b.status === 'cancelled'), 'filtre statut');
  const [{ r: desc }] = await as('authenticated', STAFF, `select public.admin_list_bookings('{"order": "desc", "limit": 50}') r`);
  const starts = desc.rows.map((b) => b.starts_at);
  eq(starts, [...starts].sort().reverse(), 'tri décroissant');
});
await test('fiche réservation : encaissements, historique, pack', async () => {
  const b = await one(`select id from public.bookings where status <> 'cancelled' and product_id is not null order by created_at limit 1`);
  await as('authenticated', STAFF, `select public.admin_record_payment($1)`, [JSON.stringify({ booking_id: b.id, amount_cents: 1000, method: 'cash', note: 'test' })]);
  const [{ r }] = await as('authenticated', STAFF, `select public.admin_get_booking($1) r`, [b.id]);
  assert(r.payments.some((p) => p.amount_cents === 1000 && p.recorded_by === 'Accueil'), 'encaissement tracé avec son auteur');
  assert(r.history.some((h) => h.action === 'payment_payment' && h.actor === 'Accueil'), 'historique avec l’encaissement');
  assert(r.sessions_required >= 1 && r.customer.id, 'métadonnées');
  const [{ l }] = await as('authenticated', STAFF, `select public.admin_lookup_booking($1) l`, [r.reference.toLowerCase()]);
  assert(Array.isArray(l.payments) && Array.isArray(l.history) && typeof l.is_today === 'boolean', 'check-in : fiche complète');
});
await test('créneaux comptoir : capacité totale, blocages signalés', async () => {
  const online = await as('anon', null, `select remaining from public.get_availability($1, $2::date, 1) where track_name = 'Circuit 1' order by starts_at limit 1`, [P390, DAY2]);
  const counter = await as('authenticated', STAFF, `select remaining, blocked from public.admin_availability($1, $2::date, 1) where track_name = 'Circuit 1' order by starts_at limit 1`, [P390, DAY2]);
  assert(counter[0].remaining > online[0].remaining, `comptoir (${counter[0].remaining}) > en ligne (${online[0].remaining})`);
});
await test('saisie comptoir sans email, puis recherche client par téléphone', async () => {
  const [{ slot_id: slot }] = await as('authenticated', STAFF,
    `select slot_id from public.admin_availability($1, ($2::date + 2), 2) where available order by starts_at desc limit 1`, [P390, DAY2]);
  const [{ r }] = await as('authenticated', STAFF, `select public.admin_create_booking($1) r`, [JSON.stringify({
    product_id: P390, slot_ids: [slot], karts: 2, source: 'counter', participants: [],
    customer: { first_name: 'Paul', last_name: 'Sanscourriel', phone: '06 12 34 56 78' }, notify_customer: false })]);
  eq(r.status, 'confirmed', 'réservation');
  const [{ c }] = await as('authenticated', STAFF, `select public.admin_list_customers('{"q": "12 34 56"}') c`);
  eq(c.rows.map((x) => x.last_name), ['Sanscourriel'], 'recherche téléphone');
  const [{ d }] = await as('authenticated', STAFF, `select public.admin_get_customer($1) d`, [c.rows[0].id]);
  eq(d.bookings.length, 1, 'historique client');
  assert(!('pilot_key' in d), 'clé pilote non exposée');
});
await test('création de fiche client : doublon d\'email refusé', async () => {
  await expectError('KR_CUSTOMER_EXISTS', as('authenticated', STAFF, `select public.admin_create_customer($1)`, [JSON.stringify({ last_name: 'Martin', email: 'JULIE@example.com' })]));
  const [{ id }] = await as('authenticated', STAFF, `select public.admin_create_customer($1) id`, [JSON.stringify({ last_name: 'Nouveau', phone: '0611111111' })]);
  assert(id, 'fiche créée');
});
await test('bons : recherche par code partiel et par commande, fiche avec mouvements', async () => {
  const card = await one(`select id, code, order_reference from public.gift_cards where order_reference is not null and status <> 'pending_payment' limit 1`);
  const [{ r: byCode }] = await as('authenticated', STAFF, `select public.admin_list_gift_cards($1) r`, [JSON.stringify({ q: card.code.slice(4, 13).toLowerCase() })]);
  assert(byCode.rows.some((g) => g.id === card.id), 'code partiel');
  const [{ r: byOrder }] = await as('authenticated', STAFF, `select public.admin_list_gift_cards($1) r`, [JSON.stringify({ q: card.order_reference })]);
  eq(byOrder.rows.map((g) => g.id), [card.id], 'référence de commande');
  const [{ g }] = await as('authenticated', STAFF, `select public.admin_get_gift_card($1) g`, [card.id]);
  assert(g.transactions.some((t) => t.kind === 'issue') && g.payments.length === 1, 'mouvements et encaissement');
});
await test('demandes : liste, bloc lié par request_id', async () => {
  const req = await one(`select id, customer_id from public.requests order by created_at limit 1`);
  await as('authenticated', STAFF, `select public.admin_create_block($1)`, [JSON.stringify({
    block_type: 'morning', date: DAY2, track_ids: [C2], reason: 'private_event', request_id: req.id, customer_id: req.customer_id })]);
  const [{ r }] = await as('authenticated', STAFF, `select public.admin_list_requests('{"q": ""}') r`);
  const row = r.find((x) => x.id === req.id);
  assert(row && row.block && row.block.reason === 'private_event', 'blocage rattaché à la demande');
});
await test('planning : synthèse mensuelle, blocages, liste des blocages', async () => {
  const [{ s }] = await as('authenticated', STAFF, `select public.admin_planning_summary($1::date, ($1::date + 6)) s`, [DAY]);
  // Jours à venir (les créneaux déjà passés n'ont pas de capacité)
  assert(s.length === 7 && s.every((d) => d.capacity > 0), `un jour par date, capacité : ${JSON.stringify(s.map((d) => [d.day, d.capacity]))}`);
  assert(s.some((d) => d.blocks.length > 0), 'blocages visibles');
  await expectError('KR_RANGE_INVALID', as('authenticated', STAFF, `select public.admin_planning_summary($1::date, ($1::date + 90))`, [TODAY]));
  const [{ b }] = await as('authenticated', STAFF, `select public.admin_list_blocks($1::date, ($1::date + 30)) b`, [TODAY]);
  assert(b.length > 0 && b.every((x) => 'series_count' in x && 'kept_bookings' in x), 'liste des blocages');
});
await test('catalogue complet et contenus (y compris masqués)', async () => {
  await db.query(`update public.products set is_active = false where slug = 'session-baby-kart'`);
  const [{ c }] = await as('authenticated', STAFF, `select public.admin_catalog() c`);
  assert(c.products.some((p) => p.slug === 'session-baby-kart' && !p.is_active), 'produit inactif listé');
  assert(c.opening_hours.length > 0 && c.capacities.length > 0, 'horaires et capacités');
  await db.query(`update public.products set is_active = true where slug = 'session-baby-kart'`);
  const [{ k }] = await as('authenticated', STAFF, `select public.admin_list_content() k`);
  assert(k.some((x) => x.key === 'banner' && x.is_published === false), 'bannière masquée listée');
});
await test('équipe : ajout par email (compte existant requis), journal', async () => {
  await expectError('KR_USER_NOT_FOUND', as('authenticated', OWNER, `select public.admin_add_staff('inconnu@example.com', 'staff', 'Inconnu')`));
  await as('authenticated', OWNER, `select public.admin_add_staff('client@example.com', 'staff', 'Renfort')`);
  await expectError('KR_STAFF_EXISTS', as('authenticated', OWNER, `select public.admin_add_staff('client@example.com', 'staff', 'Renfort')`));
  const [{ l }] = await as('authenticated', OWNER, `select public.admin_list_staff() l`);
  assert(l.some((m) => m.email === 'client@example.com' && m.role === 'staff'), 'membre ajouté');
  await as('authenticated', OWNER, `select public.admin_set_staff_role($1, 'staff', 'Renfort', false)`, [CLIENT]);
  const [{ a }] = await as('authenticated', OWNER, `select public.admin_list_audit('{"entity": "staff_roles"}') a`);
  assert(a.total >= 2 && a.rows[0].actor === 'Dirigeant', 'journal filtré avec auteur');
});

console.log('\nRecette : scénarios métier de bout en bout');
{
  const { d: RAIN } = await one(`select (app.local_date(now()) + 13)::text as d`);
  const [s10, s11] = [await slotAt('circuit-1', RAIN, '10:00'), await slotAt('circuit-1', RAIN, '11:00')];
  const s14 = await slotAt('circuit-2', RAIN, '14:00');
  let paid, byCard, unpaid, card;

  await test('annulation météo d’une journée : réservations payées, par bon et non payées', async () => {
    paid = await holdAndConfirm(P390, [s10], [adult('Pluie', 'Paye')], { customer: { ...customer, email: 'paye@example.com' } });
    await as('authenticated', STAFF, `select public.admin_record_payment($1)`, [JSON.stringify({ booking_id: paid.booking_id, amount_cents: 2400, method: 'card' })]);
    const [{ c }] = await as('authenticated', STAFF, `select public.admin_issue_gift_card($1) c`, [
      JSON.stringify({ kind: 'amount', amount_cents: 2400, payment: { method: 'cash' }, send_email: false })]);
    card = c;
    byCard = await holdAndConfirm(P390, [s11], [adult('Pluie', 'Bon')], { customer: { ...customer, email: 'bon@example.com' }, gift: card.code });
    eq(byCard.amount_due_cents, 0, 'réservation réglée par le bon');
    unpaid = await holdAndConfirm(P22, [s14], [adult('Pluie', 'Rien')], { customer: { ...customer, email: 'rien@example.com' } });

    await db.exec(`delete from public.email_outbox`);
    // Adresse du dirigeant renseignée (paramètre provisoire vide dans le seed)
    await as('authenticated', OWNER, `select public.admin_set_setting('notify_email', '"patron@example.com"'::jsonb)`);
    const [{ r }] = await as('authenticated', OWNER, `select public.admin_create_block($1, $2) r`, [
      JSON.stringify({ block_type: 'full_day', date: RAIN, all_tracks: true, reason: 'weather', is_public: true, public_label: 'Fermé (météo)' }),
      JSON.stringify({ default: 'cancel' }),
    ]);
    eq(r.conflicts.map((x) => x.action).sort(), ['cancel', 'cancel', 'cancel'], 'trois annulations');

    const rows = (await db.query(`select id, status, cancellation_outcome from public.bookings where id = any($1)`, [[paid.booking_id, byCard.booking_id, unpaid.booking_id]])).rows;
    const byId = Object.fromEntries(rows.map((x) => [x.id, x]));
    eq([byId[paid.booking_id].cancellation_outcome, byId[byCard.booking_id].cancellation_outcome, byId[unpaid.booking_id].cancellation_outcome],
      ['refund_due', 'full_refund', 'full_refund'], 'restitutions');
    assert(rows.every((x) => x.status === 'cancelled'), 'toutes annulées');
    eq((await one(`select balance_cents from public.gift_cards where id = $1`, [card.id])).balance_cents, 2400, 'bon recrédité');
  });

  await test('annulation météo : emails aux clients et au dirigeant, journée fermée en ligne et au calendrier', async () => {
    const mails = (await db.query(`select template, to_email from public.email_outbox order by to_email, template`)).rows;
    for (const email of ['paye@example.com', 'bon@example.com', 'rien@example.com']) {
      assert(mails.some((m) => m.to_email === email && m.template === 'booking_cancelled_by_circuit'), `email client ${email}`);
    }
    eq(mails.filter((m) => m.template === 'owner_booking_cancelled').length, 3, 'notifications dirigeant');
    const slots = await as('anon', null, `select * from public.get_availability($1, $2::date, 1)`, [P390, RAIN]);
    eq(slots.length, 0, 'aucun créneau réservable ce jour-là');
    const cal = await as('anon', null, `select title from public.get_public_calendar($1::date, $1::date) where item_type = 'block'`, [RAIN]);
    assert(cal.some((x) => x.title === 'Fermé (météo)'), 'fermeture affichée au calendrier public');
  });

  await test('remboursement du client payé : suivi « à rembourser » jusqu’à l’enregistrement', async () => {
    const [{ d }] = await as('authenticated', OWNER, `select public.admin_dashboard($1::date) d`, [RAIN]);
    assert(d.refunds_due >= 1, 'alerte « remboursements à effectuer »');
    await expectError('KR_FORBIDDEN', as('authenticated', STAFF, `select public.admin_record_payment($1)`, [
      JSON.stringify({ booking_id: paid.booking_id, amount_cents: 2400, method: 'card', kind: 'refund' })]));
    await as('authenticated', OWNER, `select public.admin_record_payment($1)`, [
      JSON.stringify({ booking_id: paid.booking_id, amount_cents: 2400, method: 'card', kind: 'refund', note: 'Météo' })]);
    eq((await one(`select cancellation_outcome from public.bookings where id = $1`, [paid.booking_id])).cancellation_outcome, 'full_refund', 'soldé');
  });

  await test('abandon du parcours (équivalent d’un paiement échoué) : capacité rendue aussitôt, blocage inutilisable', async () => {
    const { d: DAYX } = await one(`select (app.local_date(now()) + 14)::text as d`);
    const slot = await slotAt('circuit-2', DAYX, '16:00');
    const before = (await as('anon', null, `select remaining from public.get_availability($1, $2::date, 1) where slot_id = $3`, [P390, DAYX, slot]))[0].remaining;
    const [{ h }] = await as('anon', null, `select public.create_booking_hold($1, array[$2]::uuid[], $3) h`, [P390, slot, before]);
    eq((await as('anon', null, `select remaining from public.get_availability($1, $2::date, 1) where slot_id = $3`, [P390, DAYX, slot]))[0].remaining, 0, 'bloqué pendant la saisie');
    await as('anon', null, `select public.release_booking_hold($1)`, [h.hold_token]);
    eq((await as('anon', null, `select remaining from public.get_availability($1, $2::date, 1) where slot_id = $3`, [P390, DAYX, slot]))[0].remaining, before, 'capacité rendue');
    await expectError('KR_HOLD', as('anon', null, `select public.confirm_booking($1, $2, $3, true, true, '', null)`,
      [h.hold_token, JSON.stringify(customer), JSON.stringify([adult('Parti')])]));
  });
}

console.log(`\n${passed} réussis, ${failures.length} échoués`);
process.exit(failures.length ? 1 : 0);
