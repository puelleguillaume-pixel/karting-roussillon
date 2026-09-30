-- =============================================================================
-- Karting Roussillon — Données de DÉMONSTRATION
-- Chargées uniquement par le mode démo du front (base PGlite dans le navigateur).
-- NE JAMAIS appliquer en production. Tout est explicitement libellé « exemple ».
-- =============================================================================

begin;

-- Adresse fictive du dirigeant : les notifications « dirigeant » apparaissent
-- dans la boîte mail de démonstration
update public.settings set value = '"dirigeant@exemple.fr"' where key = 'notify_email';

-- Compte dirigeant de démonstration (utilisé pour simuler les actions de
-- l'accueil, ex. encaissement d'un bon cadeau ; identifiant repris par le front)
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-00000000d0e0', 'dirigeant@exemple.fr', now());
insert into public.staff_roles (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000d0e0', 'owner', 'Dirigeant (démo)');

-- Compte « accueil » de démonstration (rôle staff : ni CA, ni paramètres, ni catalogue)
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-00000000a11e', 'accueil@exemple.fr', now());
insert into public.staff_roles (user_id, role, display_name)
values ('00000000-0000-4000-8000-00000000a11e', 'staff', 'Accueil (démo)');

-- Bannière d'information publiée (pour montrer le composant)
update public.site_content
   set is_published = true,
       body = $$Exemple de bannière d'information : l'équipe peut la modifier depuis l'espace dirigeant (fermeture météo, horaires exceptionnels…).$$
 where key = 'banner';

-- Trackdays d'exemple sur le Circuit 3, avec le blocage de planning associé
with ev as (
  insert into public.events (slug, title, kind, category, description, starts_at, ends_at, capacity, price_cents,
                             requires_own_vehicle, is_published, is_bookable)
  values
    ('exemple-trackday-moto', 'Trackday moto (exemple)', 'trackday', 'moto',
     'Événement d''exemple créé pour la démonstration.',
     app.local_ts(app.local_date(now()) + 12, '09:00'), app.local_ts(app.local_date(now()) + 12, '18:00'), 25, 15000, true, true, true),
    ('exemple-trackday-auto', 'Trackday auto (exemple)', 'trackday', 'auto',
     'Événement d''exemple créé pour la démonstration.',
     app.local_ts(app.local_date(now()) + 26, '09:00'), app.local_ts(app.local_date(now()) + 26, '18:00'), 20, 18000, true, true, true)
  returning id, starts_at, ends_at, title
),
et as (
  insert into public.event_tracks (event_id, track_id)
  select ev.id, t.id from ev, public.tracks t where t.slug = 'circuit-3'
  returning event_id
),
bl as (
  insert into public.schedule_blocks (starts_at, ends_at, block_type, reason, public_label, is_public, event_id, internal_note)
  select ev.starts_at, ev.ends_at, 'custom', 'trackday', ev.title, true, ev.id, 'Exemple de démonstration'
  from ev
  returning id
)
insert into public.schedule_block_tracks (block_id, track_id)
select bl.id, t.id from bl, public.tracks t where t.slug = 'circuit-3';

-- Privatisation publique d'exemple (Circuit 1, après-midi)
with b as (
  insert into public.schedule_blocks (starts_at, ends_at, block_type, reason, public_label, is_public, internal_note)
  values (app.local_ts(app.local_date(now()) + 8, '13:00'), app.local_ts(app.local_date(now()) + 8, '19:00'),
          'afternoon', 'private_event', 'Circuit 1 privatisé (exemple)', true, 'Exemple de démonstration')
  returning id
)
insert into public.schedule_block_tracks (block_id, track_id)
select b.id, t.id from b, public.tracks t where t.slug = 'circuit-1';

-- Statuts des droits de piste (Circuit 2) sur 45 jours : motif d'exemple
insert into public.track_access_calendar (track_id, day, status, public_label)
select t.id, d::date,
       case
         when extract(isodow from d) = 2 then 'restricted'
         when (d::date - app.local_date(now())) in (5, 19, 33) then 'closed'
         else 'open'
       end::public.track_access_status,
       case
         when extract(isodow from d) = 2 then 'Accès restreint (exemple)'
         when (d::date - app.local_date(now())) in (5, 19, 33) then 'Fermé au droit de piste (exemple)'
         else ''
       end
from public.tracks t, generate_series(app.local_date(now()), app.local_date(now()) + 44, interval '1 day') d
where t.slug = 'circuit-2';

-- Statuts du Circuit 3 : trackdays et privatisation d'exemple
insert into public.track_access_calendar (track_id, day, status, public_label)
select t.id, app.local_date(now()) + x.offset_days, x.status::public.track_access_status, x.label
from public.tracks t,
     (values (12, 'trackday', 'Trackday moto (exemple)'),
             (26, 'trackday', 'Trackday auto (exemple)'),
             (16, 'private',  'Privatisé (exemple)')) as x(offset_days, status, label)
where t.slug = 'circuit-3';

-- Chronos d'exemple
insert into public.lap_records (track_id, vehicle_type_id, category_label, driver_name, lap_time_ms, recorded_on)
select t.id, v.id, x.category, x.driver, x.ms, app.local_date(now()) - x.days_ago
from (values
  ('circuit-2', 'sodikart-30cv', 'SodiKart 2T 30 CV', 'Pilote exemple A', 44210, 3),
  ('circuit-2', 'sodikart-30cv', 'SodiKart 2T 30 CV', 'Pilote exemple B', 44987, 12),
  ('circuit-2', 'sodikart-30cv', 'SodiKart 2T 30 CV', 'Pilote exemple C', 45530, 20),
  ('circuit-2', 'sodikart-22cv', 'SodiKart 2T 22 CV', 'Pilote exemple D', 46120, 5),
  ('circuit-2', 'sodikart-22cv', 'SodiKart 2T 22 CV', 'Pilote exemple E', 46804, 9),
  ('circuit-1', 'sodikart-390',  'SodiKart 390 cc',   'Pilote exemple F', 38950, 2),
  ('circuit-1', 'sodikart-390',  'SodiKart 390 cc',   'Pilote exemple G', 39412, 15),
  ('circuit-1', 'sodikart-390',  'SodiKart 390 cc',   'Pilote exemple H', 40077, 30),
  ('circuit-1', 'kart-160',      'Kart 160 cc',       'Pilote exemple I', 45890, 6),
  ('circuit-1', 'kart-160',      'Kart 160 cc',       'Pilote exemple J', 47215, 11)
) as x(track, vehicle, category, driver, ms, days_ago)
join public.tracks t on t.slug = x.track
join public.vehicle_types v on v.slug = x.vehicle;

-- Avis : emplacements d'exemple (les vrais avis sont saisis dans l'admin, jamais inventés)
insert into public.reviews (author_name, rating, body, source, is_published, sort_order) values
  ('Avis d''exemple', 5, 'Emplacement d''un avis client. Les avis réels sont ajoutés depuis l''espace dirigeant.', 'google', true, 1),
  ('Avis d''exemple', 5, 'Emplacement d''un avis client. Les avis réels sont ajoutés depuis l''espace dirigeant.', 'google', true, 2),
  ('Avis d''exemple', 4, 'Emplacement d''un avis client. Les avis réels sont ajoutés depuis l''espace dirigeant.', 'facebook', true, 3);

-- -----------------------------------------------------------------------------
-- Activité d'exemple pour l'espace dirigeant : clients, réservations sur les
-- 7 prochains jours (créneaux encore à venir uniquement), demandes, bons.
-- Tous les noms portent « Exemple » ; les emails sont en @example.com.
-- -----------------------------------------------------------------------------
do $demo$
declare
  v_customers uuid[] := '{}';
  v_id        uuid;
  r           record;
  v_slot      uuid;
  v_product   public.products;
  v_token     uuid;
  v_booking   uuid;
  v_i         integer := 0;
begin
  for r in select * from (values
      ('Julie', 'Exemple',  'julie.exemple@example.com',  '0600000001', ''),
      ('Marc',  'Exemple',  'marc.exemple@example.com',   '0600000002', ''),
      ('Sofia', 'Exemple',  'sofia.exemple@example.com',  '0600000003', ''),
      ('Karim', 'Exemple',  'karim.exemple@example.com',  '0600000004', 'Société Exemple SARL'),
      ('Lucie', 'Exemple',  'lucie.exemple@example.com',  '0600000005', ''),
      ('Hugo',  'Exemple',  'hugo.exemple@example.com',   '0600000006', '')
    ) as c(first_name, last_name, email, phone, company)
  loop
    insert into public.customers (first_name, last_name, email, phone, company)
    values (r.first_name, r.last_name, r.email, r.phone, r.company)
    returning id into v_id;
    v_customers := v_customers || v_id;
  end loop;

  -- (jour, heure locale, produit, karts, client, source, participants)
  for r in select * from (values
      (0, '11:00', 'session-sodikart-390',  3, 1, 'online', '[{"first_name":"Julie","last_name":"Exemple","birth_date":"1990-04-12","role":"driver"},{"first_name":"Paul","last_name":"Exemple","birth_date":"1988-09-02","role":"driver"},{"first_name":"Emma","last_name":"Exemple","birth_date":"2008-01-20","role":"driver","guardian_name":"Julie Exemple"}]'),
      (0, '14:30', 'session-sodikart-22cv', 2, 2, 'phone',  '[]'),
      (0, '16:00', 'session-biplace',       1, 3, 'online', '[{"first_name":"Sofia","last_name":"Exemple","birth_date":"1985-06-30","role":"driver"},{"first_name":"Léo","last_name":"Exemple","birth_date":"2016-03-14","role":"passenger","height_cm":115,"guardian_name":"Sofia Exemple"}]'),
      (0, '17:30', 'session-sodikart-390',  4, 4, 'online', '[]'),
      (0, '18:15', 'session-sodikart-30cv', 2, 5, 'counter','[]'),
      (1, '10:00', 'session-sodikart-390',  2, 6, 'online', '[{"first_name":"Hugo","last_name":"Exemple","birth_date":"1995-11-05","role":"driver"},{"first_name":"Nina","last_name":"Exemple","birth_date":"1997-02-17","role":"driver"}]'),
      (1, '15:00', 'session-sodikart-30cv', 3, 4, 'phone',  '[]'),
      (2, '11:30', 'session-sodikart-390',  5, 2, 'online', '[]'),
      (3, '14:00', 'session-sodikart-22cv', 2, 5, 'online', '[]'),
      (5, '10:30', 'session-biplace',       2, 1, 'online', '[]'),
      (6, '16:45', 'session-sodikart-390',  6, 3, 'phone',  '[]')
    ) as b(day_offset, local_time, product_slug, karts, customer_idx, source, participants)
  loop
    begin
      select * into v_product from public.products where slug = r.product_slug;
      v_slot := null;
      select sl.id into v_slot
      from public.slots sl
      join public.product_tracks pt on pt.track_id = sl.track_id and pt.product_id = v_product.id
      join public.tracks t on t.id = sl.track_id
      where sl.starts_at = app.local_ts(app.local_date(now()) + r.day_offset, r.local_time::time)
        and sl.starts_at > now() + interval '15 minutes'
      order by t.sort_order limit 1;
      continue when v_slot is null;
      select h.hold_token into v_token from app.create_hold(v_product.id, array[v_slot], r.karts, false) h;
      v_booking := app.create_booking_from_hold(v_token, v_customers[r.customer_idx], r.participants::jsonb,
                                                r.source::public.booking_source, false, null, '', 'confirmed', false);
      v_i := v_i + 1;
      -- Quelques encaissements d'exemple (réglé à l'avance par téléphone)
      if v_i % 3 = 0 then
        insert into public.payments (booking_id, kind, method, amount_cents, vat_rate_bp, vat_cents, note)
        select b.id, 'payment', 'card', b.total_cents, b.vat_rate_bp,
               round(b.total_cents * b.vat_rate_bp / (10000.0 + b.vat_rate_bp))::integer, 'Exemple de démonstration'
        from public.bookings b where b.id = v_booking;
      end if;
    exception when others then
      -- créneau complet ou bloqué : la réservation d'exemple est ignorée
      raise notice 'Réservation d''exemple ignorée (%, %) : %', r.product_slug, r.local_time, sqlerrm;
    end;
  end loop;

  -- Demandes d'exemple (anniversaire, team building, EVG)
  insert into public.requests (reference, type, status, customer_id, contact_name, contact_email, contact_phone, company,
                               preferred_date, participants_count, message, details, quote_amount_cents, created_at, status_changed_at)
  values
    ('DM-EX0001', 'birthday', 'new', v_customers[1], 'Julie Exemple', 'julie.exemple@example.com', '0600000001', '',
     app.local_date(now()) + 18, 8, 'Demande d''exemple : anniversaire pour 8 enfants de 10 ans.', '{}', null,
     now() - interval '3 hours', now() - interval '3 hours'),
    ('DM-EX0002', 'team_building', 'quoted', v_customers[4], 'Karim Exemple', 'karim.exemple@example.com', '0600000004', 'Société Exemple SARL',
     app.local_date(now()) + 30, 24, 'Demande d''exemple : séminaire d''entreprise, une demi-journée.', '{}', 120000,
     now() - interval '4 days', now() - interval '2 days'),
    ('DM-EX0003', 'bachelor_party', 'new', v_customers[6], 'Hugo Exemple', 'hugo.exemple@example.com', '0600000006', '',
     app.local_date(now()) + 10, 10, 'Demande d''exemple : EVG, course d''endurance souhaitée.', '{}', null,
     now() - interval '1 day', now() - interval '1 day');

  -- Bons d'exemple : une commande en attente de règlement, un bon actif émis au comptoir
  insert into public.gift_cards (code, kind, source, initial_amount_cents, balance_cents, status, purchaser_customer_id,
                                 recipient_name, message, order_reference, deliver_to, ordered_at)
  values ('KDO-EXEM-PLE0-0001', 'amount', 'sale', 5000, 5000, 'pending_payment', v_customers[5],
          'Tom Exemple', 'Message d''exemple', 'BC-EX0001', 'buyer', now() - interval '5 hours');
  perform app.issue_gift_card('amount', 'manual', 10000, null, true, v_customers[2], 'Anna Exemple', null,
                              'Bon d''exemple émis au comptoir');
end;
$demo$;

-- Les emails générés par ces exemples ne sont pas affichés dans la boîte de démo
delete from public.email_outbox;

commit;
