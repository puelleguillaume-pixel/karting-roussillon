-- =============================================================================
-- Karting Roussillon — 07 · RPC publiques (site vitrine, parcours client)
-- Exposées via PostgREST : /rest/v1/rpc/<nom>
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Disponibilités d'un produit pour une journée (temps réel).
-- Exclut : créneaux passés / trop proches, blocages, pistes non réservables.
-- -----------------------------------------------------------------------------
create or replace function public.get_availability(p_product_id uuid, p_day date, p_karts integer default 1)
returns table (
  slot_id    uuid,
  track_id   uuid,
  track_name text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  remaining  integer,
  available  boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_lead    integer := app.setting_int('booking_min_lead_minutes', 30);
  v_horizon integer := app.setting_int('booking_horizon_days', 90);
  v_ids     uuid[];
begin
  select * into v_product from public.products where id = p_product_id;
  perform app.assert_product_bookable(v_product, p_day, true);
  if p_day < app.local_date(now()) or p_day > app.local_date(now()) + v_horizon then
    return;
  end if;

  select array_agg(sl.id) into v_ids
  from public.slots sl
  join public.tracks t on t.id = sl.track_id
  join public.product_tracks pt on pt.track_id = sl.track_id and pt.product_id = p_product_id
  where sl.starts_at >= app.local_ts(p_day, '00:00') and sl.starts_at < app.local_ts(p_day + 1, '00:00')
    and sl.starts_at >= now() + make_interval(mins => v_lead)
    and sl.is_active and t.is_active and t.online_booking_enabled
    and exists (select 1 from public.slot_capacities sc
                where sc.slot_id = sl.id and sc.vehicle_type_id = v_product.vehicle_type_id and sc.online_capacity > 0)
    and not app.is_blocked(sl.track_id, sl.starts_at, sl.ends_at);

  if v_ids is null then
    return;
  end if;

  return query
  select sl.id, t.id, t.short_name, sl.starts_at, sl.ends_at, r.remaining, r.remaining >= greatest(p_karts, 1)
  from app.slots_remaining(v_ids, v_product.vehicle_type_id, true) r
  join public.slots sl on sl.id = r.slot_id
  join public.tracks t on t.id = sl.track_id
  order by sl.starts_at, t.sort_order;
end;
$$;

-- Jours ayant au moins un créneau disponible (pour le calendrier du parcours)
create or replace function public.get_available_days(p_product_id uuid, p_from date, p_to date, p_karts integer default 1)
returns table (day date, available_slots integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  d date;
begin
  if p_to < p_from or p_to - p_from > 62 then
    perform app.fail('KR_RANGE_INVALID', 'Période de 62 jours maximum.');
  end if;
  for d in select g::date from generate_series(greatest(p_from, app.local_date(now())), p_to, interval '1 day') g loop
    begin
      day := d;
      select count(*) filter (where a.available)::integer into available_slots
      from public.get_availability(p_product_id, d, p_karts) a;
      return next;
    exception when sqlstate 'P0001' then
      -- produit hors saison ce jour-là
      day := d; available_slots := 0; return next;
    end;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Parcours de réservation
-- -----------------------------------------------------------------------------

-- Étape 2 → 3 : bloque la capacité pendant la saisie des participants.
create or replace function public.create_booking_hold(p_product_id uuid, p_slot_ids uuid[], p_karts integer)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from app.create_hold(p_product_id, p_slot_ids, p_karts, true);
  return jsonb_build_object('hold_token', r.hold_token, 'expires_at', r.expires_at);
end;
$$;

-- Abandon du parcours : libère immédiatement la capacité.
create or replace function public.release_booking_hold(p_hold_token uuid)
returns void language sql volatile security definer
set search_path = ''
as $$ delete from public.booking_holds where hold_token = p_hold_token $$;

-- Étape finale : confirmation (paiement sur place ; bon cadeau optionnel).
create or replace function public.confirm_booking(
  p_hold_token      uuid,
  p_customer        jsonb,
  p_participants    jsonb,
  p_accept_terms    boolean,
  p_accept_waiver   boolean,
  p_customer_note   text default '',
  p_gift_card_code  text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_booking  uuid;
  v_json     jsonb;
begin
  if not coalesce(p_accept_terms, false) then
    perform app.fail('KR_TERMS_REQUIRED', 'Merci d''accepter les conditions générales de vente.');
  end if;
  if not coalesce(p_accept_waiver, false) then
    perform app.fail('KR_WAIVER_REQUIRED', 'Merci d''accepter la décharge de responsabilité.');
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0
     or jsonb_array_length(p_participants) > 40 then
    perform app.fail('KR_PARTICIPANTS_REQUIRED', 'La liste des participants est obligatoire.');
  end if;

  v_customer := app.upsert_customer(p_customer, true);
  v_booking  := app.create_booking_from_hold(p_hold_token, v_customer, p_participants, 'online', true,
                                             p_gift_card_code, p_customer_note, 'confirmed', true);
  update public.bookings set terms_accepted_at = now() where id = v_booking;

  v_json := app.booking_json(v_booking);
  perform app.enqueue_email('booking_confirmation', v_json #>> '{customer,email}', v_json);
  perform app.enqueue_email('owner_new_booking', app.setting_text('notify_email'), v_json);

  return jsonb_build_object(
    'booking_id', v_booking,
    'reference', v_json ->> 'reference',
    'qr_token', v_json ->> 'qr_token',
    'starts_at', v_json ->> 'starts_at',
    'total_cents', (v_json ->> 'total_cents')::integer,
    'gift_card_applied_cents', (v_json ->> 'gift_card_applied_cents')::integer,
    'amount_due_cents', (v_json ->> 'amount_due_cents')::integer);
end;
$$;

-- -----------------------------------------------------------------------------
-- Gestion de réservation par lien (qr_token reçu par email) — sans compte.
-- -----------------------------------------------------------------------------
create or replace function public.get_booking_by_token(p_qr_token uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_json  jsonb;
  v_hours numeric;
  v_full  integer := app.setting_int('cancel_full_refund_hours', 48);
  v_cred  integer := app.setting_int('cancel_credit_hours', 24);
begin
  select id into v_id from public.bookings where qr_token = p_qr_token;
  if v_id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND', 'Réservation introuvable.');
  end if;
  v_json := app.booking_json(v_id);
  v_hours := extract(epoch from ((v_json ->> 'starts_at')::timestamptz - now())) / 3600;
  return v_json || jsonb_build_object(
    'can_cancel', (v_json ->> 'status') in ('confirmed', 'pending', 'reschedule_required')
                  and ((v_json ->> 'status') = 'reschedule_required' or v_hours >= v_cred),
    'can_reschedule', (v_json ->> 'status') in ('confirmed', 'pending', 'reschedule_required')
                  and (v_json ->> 'product') is not null
                  and ((v_json ->> 'status') = 'reschedule_required' or v_hours >= v_full),
    'cancel_outcome_if_now', case
        when (v_json ->> 'status') = 'reschedule_required' or v_hours >= v_full then 'full_refund'
        when v_hours >= v_cred then 'credit'
        else 'none' end);
end;
$$;

create or replace function public.cancel_booking_by_token(p_qr_token uuid)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b     public.bookings;
  v_hours numeric;
  v_outcome text;
begin
  select * into v_b from public.bookings where qr_token = p_qr_token for update;
  if v_b.id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND', 'Réservation introuvable.');
  end if;
  if v_b.status not in ('confirmed', 'pending', 'reschedule_required') then
    perform app.fail('KR_BOOKING_NOT_CANCELLABLE', 'Cette réservation ne peut plus être annulée.');
  end if;

  v_hours := extract(epoch from (v_b.starts_at - now())) / 3600;
  if v_b.status = 'reschedule_required' or v_hours >= app.setting_int('cancel_full_refund_hours', 48) then
    v_outcome := 'full_refund';
  elsif v_hours >= app.setting_int('cancel_credit_hours', 24) then
    v_outcome := 'credit';
  else
    perform app.fail('KR_CANCELLATION_TOO_LATE',
      format('Annulation en ligne impossible à moins de %s h du départ. Contactez le circuit.',
             app.setting_int('cancel_credit_hours', 24)));
  end if;

  return app.apply_cancellation(v_b.id, v_outcome, 'Annulation par le client', 'booking_cancelled');
end;
$$;

-- Report : le client prend d'abord un hold (create_booking_hold) sur les
-- nouveaux créneaux du même produit et du même nombre de karts.
create or replace function public.reschedule_booking_by_token(p_qr_token uuid, p_hold_token uuid)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b      public.bookings;
  v_slots  uuid[];
  v_json   jsonb;
begin
  select * into v_b from public.bookings where qr_token = p_qr_token for update;
  if v_b.id is null or v_b.product_id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND', 'Réservation introuvable.');
  end if;
  if v_b.status not in ('confirmed', 'pending', 'reschedule_required') then
    perform app.fail('KR_BOOKING_NOT_RESCHEDULABLE', 'Cette réservation ne peut plus être reportée.');
  end if;
  if v_b.status <> 'reschedule_required'
     and v_b.starts_at < now() + make_interval(hours => app.setting_int('cancel_full_refund_hours', 48)) then
    perform app.fail('KR_RESCHEDULE_TOO_LATE',
      format('Report en ligne possible jusqu''à %s h avant le départ.', app.setting_int('cancel_full_refund_hours', 48)));
  end if;

  select array_agg(h.slot_id order by h.seq) into v_slots
  from public.booking_holds h
  where h.hold_token = p_hold_token and h.expires_at > now()
    and h.product_id = v_b.product_id and h.karts = v_b.karts;
  if v_slots is null then
    perform app.fail('KR_HOLD_NOT_FOUND', 'Votre sélection a expiré, merci de choisir à nouveau un créneau.');
  end if;

  perform app.move_booking(v_b.id, v_slots, true, p_hold_token);

  v_json := app.booking_json(v_b.id);
  perform app.enqueue_email('booking_rescheduled', v_json #>> '{customer,email}', v_json);
  perform app.enqueue_email('owner_booking_rescheduled', app.setting_text('notify_email'), v_json);
  return v_json;
end;
$$;

-- -----------------------------------------------------------------------------
-- Espace client connecté
-- -----------------------------------------------------------------------------
create or replace function public.my_bookings()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.booking_json(b.id) order by b.starts_at desc), '[]'::jsonb)
  from public.bookings b
  where b.customer_id = app.current_customer_id() and auth.uid() is not null
$$;

-- Rattache (ou crée) la fiche client du compte connecté, par email vérifié.
create or replace function public.claim_customer_profile(p_first_name text default '', p_last_name text default '', p_phone text default '')
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    uuid;
begin
  if v_uid is null then
    perform app.fail('KR_AUTH_REQUIRED');
  end if;
  select id into v_id from public.customers where auth_user_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    perform app.fail('KR_EMAIL_NOT_CONFIRMED', 'Confirmez votre adresse email pour accéder à vos réservations.');
  end if;
  update public.customers set auth_user_id = v_uid
   where lower(email) = v_email and auth_user_id is null
   returning id into v_id;
  if v_id is null then
    insert into public.customers (auth_user_id, email, first_name, last_name, phone)
    values (v_uid, v_email, left(coalesce(p_first_name, ''), 80), left(coalesce(p_last_name, ''), 80), left(coalesce(p_phone, ''), 30))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Événements (trackdays) — réservation de places, règlement sur place
-- -----------------------------------------------------------------------------
create or replace function public.get_event_availability(p_event_id uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'capacity', e.capacity,
    'places_left', greatest(e.capacity - coalesce((
        select sum(b.participants_count) from public.bookings b
        where b.event_id = e.id and app.is_active_status(b.status)), 0), 0),
    'is_bookable', e.is_bookable and e.starts_at > now())
  from public.events e
  where e.id = p_event_id and e.is_published
$$;

create or replace function public.book_event(
  p_event_id uuid, p_customer jsonb, p_participants jsonb,
  p_accept_terms boolean, p_accept_waiver boolean, p_customer_note text default '')
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_e        public.events;
  v_taken    integer;
  v_n        integer;
  v_customer uuid;
  v_id       uuid;
  v_ref      text;
  v_waiver   integer;
  p          jsonb;
  v_birth    date;
  v_first    text;
  v_last     text;
  v_keys     text[] := '{}';
  v_json     jsonb;
begin
  if not coalesce(p_accept_terms, false) then
    perform app.fail('KR_TERMS_REQUIRED', 'Merci d''accepter les conditions générales de vente.');
  end if;
  if not coalesce(p_accept_waiver, false) then
    perform app.fail('KR_WAIVER_REQUIRED', 'Merci d''accepter la décharge de responsabilité.');
  end if;
  select * into v_e from public.events where id = p_event_id for update;
  if v_e.id is null or not v_e.is_published or not v_e.is_bookable or v_e.starts_at <= now() then
    perform app.fail('KR_EVENT_NOT_BOOKABLE', 'Cet événement n''est pas ouvert à la réservation.');
  end if;
  v_n := coalesce(jsonb_array_length(p_participants), 0);
  if v_n < 1 or v_n > app.setting_int('max_karts_per_booking', 10) then
    perform app.fail('KR_PARTICIPANTS_COUNT', 'Nombre de participants invalide.');
  end if;
  select coalesce(sum(b.participants_count), 0) into v_taken
  from public.bookings b where b.event_id = v_e.id and app.is_active_status(b.status);
  if v_taken + v_n > v_e.capacity then
    perform app.fail('KR_EVENT_FULL', format('Il reste %s place(s).', greatest(v_e.capacity - v_taken, 0)));
  end if;

  v_customer := app.upsert_customer(p_customer, true);
  loop
    v_ref := 'KR-' || app.random_code(6);
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;
  select version into v_waiver from public.waiver_versions where is_current;

  insert into public.bookings (reference, customer_id, event_id, status, source, starts_at, booking_date, karts,
                               participants_count, unit_price_cents, total_cents, vat_rate_bp, waiver_version,
                               terms_accepted_at, customer_note)
  values (v_ref, v_customer, v_e.id, 'confirmed', 'online', v_e.starts_at, app.local_date(v_e.starts_at), 0,
          v_n, v_e.price_cents, v_e.price_cents * v_n, v_e.vat_rate_bp, v_waiver, now(),
          left(coalesce(p_customer_note, ''), 2000))
  returning id into v_id;

  for p in select * from jsonb_array_elements(p_participants) loop
    v_first := left(trim(coalesce(p ->> 'first_name', '')), 80);
    v_last  := left(trim(coalesce(p ->> 'last_name', '')), 80);
    begin v_birth := (p ->> 'birth_date')::date; exception when others then v_birth := null; end;
    if v_first = '' or v_last = '' or v_birth is null or v_birth > current_date then
      perform app.fail('KR_PARTICIPANT_NAME', 'Nom, prénom et date de naissance obligatoires pour chaque pilote.');
    end if;
    if app.age_on(v_birth, app.local_date(v_e.starts_at)) < 18 and nullif(trim(coalesce(p ->> 'guardian_name', '')), '') is null then
      perform app.fail('KR_GUARDIAN_REQUIRED', format('%s %s est mineur : représentant légal obligatoire.', v_first, v_last));
    end if;
    if app.pilot_key(v_first, v_last, v_birth) = any (v_keys) then
      perform app.fail('KR_DUPLICATE_PARTICIPANT', 'Un même pilote est saisi deux fois.');
    end if;
    v_keys := array_append(v_keys, app.pilot_key(v_first, v_last, v_birth));
    insert into public.booking_participants (booking_id, role, first_name, last_name, birth_date, pilot_key, extra,
                                             waiver_signed_at, waiver_signed_by, waiver_version)
    values (v_id, 'driver', v_first, v_last, v_birth, app.pilot_key(v_first, v_last, v_birth),
            coalesce(p -> 'extra', '{}'::jsonb), now(),
            coalesce(nullif(trim(p ->> 'guardian_name'), ''), v_first || ' ' || v_last), v_waiver);
  end loop;

  v_json := app.booking_json(v_id);
  perform app.enqueue_email('event_booking_confirmation', v_json #>> '{customer,email}', v_json);
  perform app.enqueue_email('owner_new_booking', app.setting_text('notify_email'), v_json);
  return jsonb_build_object('booking_id', v_id, 'reference', v_ref, 'qr_token', v_json ->> 'qr_token',
                            'total_cents', (v_json ->> 'total_cents')::integer);
end;
$$;

-- -----------------------------------------------------------------------------
-- Demandes (anniversaire, EVG/EVJF, team building, école, Alpine…)
-- -----------------------------------------------------------------------------
create or replace function public.submit_request(p_type public.request_type, p_contact jsonb, p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_email    text := lower(trim(coalesce(p_contact ->> 'email', '')));
  v_customer uuid;
  v_ref      text;
  v_id       uuid;
  v_payload  jsonb;
  v_date     date;
  v_alt      date;
  v_count    integer;
begin
  if (select count(*) from public.requests r
      where lower(r.contact_email) = v_email and r.created_at > now() - interval '1 hour') >= 5 then
    perform app.fail('KR_RATE_LIMITED', 'Trop de demandes envoyées, merci de réessayer plus tard.');
  end if;

  begin
    v_date  := nullif(p_details ->> 'preferred_date', '')::date;
    v_alt   := nullif(p_details ->> 'alternative_date', '')::date;
    v_count := nullif(p_details ->> 'participants_count', '')::integer;
  exception when others then
    perform app.fail('KR_REQUEST_INVALID', 'Date ou nombre de participants invalide.');
  end;
  if v_date is not null and v_date < app.local_date(now()) then
    perform app.fail('KR_REQUEST_INVALID', 'La date souhaitée est passée.');
  end if;

  v_customer := app.upsert_customer(p_contact, true);
  loop
    v_ref := 'DM-' || app.random_code(6);
    exit when not exists (select 1 from public.requests where reference = v_ref);
  end loop;

  insert into public.requests (reference, type, product_id, customer_id, contact_name, contact_email, contact_phone,
                               company, preferred_date, alternative_date, participants_count, message, details)
  values (v_ref, p_type,
          case when (p_details ->> 'product_id') ~ '^[0-9a-f-]{36}$'
               then (select id from public.products where id = (p_details ->> 'product_id')::uuid) end,
          v_customer,
          left(trim(coalesce(p_contact ->> 'first_name', '') || ' ' || coalesce(p_contact ->> 'last_name', '')), 160),
          v_email, left(coalesce(p_contact ->> 'phone', ''), 30), left(coalesce(p_contact ->> 'company', ''), 120),
          v_date, v_alt, v_count, left(coalesce(p_details ->> 'message', ''), 5000),
          p_details - 'message' - 'preferred_date' - 'alternative_date' - 'participants_count' - 'product_id')
  returning id into v_id;

  v_payload := jsonb_build_object('reference', v_ref, 'type', p_type, 'contact', p_contact,
                                  'details', p_details, 'request_id', v_id);
  perform app.enqueue_email('request_received', v_email, v_payload);
  perform app.enqueue_email('owner_new_request', app.setting_text('notify_email'), v_payload);
  return jsonb_build_object('request_id', v_id, 'reference', v_ref);
end;
$$;

-- -----------------------------------------------------------------------------
-- Bons cadeaux : consultation du solde
-- -----------------------------------------------------------------------------
create or replace function public.check_gift_card(p_code text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  select * into v_card from public.gift_cards where code = upper(trim(p_code));
  if v_card.id is null or v_card.status in ('pending_payment', 'disabled') then
    perform app.fail('KR_GIFT_CARD_INVALID', 'Code de bon cadeau invalide.');
  end if;
  return jsonb_build_object(
    'status', case when v_card.expires_at <= now() then 'expired' else v_card.status::text end,
    'kind', v_card.kind,
    'balance_cents', v_card.balance_cents,
    'expires_at', v_card.expires_at,
    'product', (select jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug)
                from public.products p where p.id = v_card.product_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Calendrier public : événements publiés, blocages publics, statuts des pistes
-- -----------------------------------------------------------------------------
create or replace function public.get_public_calendar(p_from date, p_to date)
returns table (
  item_type   text,          -- 'event' | 'block' | 'track_status'
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  day         date,
  status      text,
  track_slugs text[],
  event_slug  text,
  places_left integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 400 then
    perform app.fail('KR_RANGE_INVALID', 'Période de 400 jours maximum.');
  end if;

  return query
  select 'event'::text, e.title, e.starts_at, e.ends_at, app.local_date(e.starts_at), e.kind::text,
         array(select t.slug from public.event_tracks et join public.tracks t on t.id = et.track_id
               where et.event_id = e.id order by t.sort_order),
         e.slug,
         case when e.is_bookable then greatest(e.capacity - coalesce((
             select sum(b.participants_count) from public.bookings b
             where b.event_id = e.id and app.is_active_status(b.status)), 0), 0)::integer end
  from public.events e
  where e.is_published
    and e.starts_at < app.local_ts(p_to + 1, '00:00') and e.ends_at > app.local_ts(p_from, '00:00')
  union all
  select 'block'::text, b.public_label, b.starts_at, b.ends_at, app.local_date(b.starts_at), b.reason::text,
         case when b.all_tracks then array(select t.slug from public.tracks t where t.is_active order by t.sort_order)
              else array(select t.slug from public.schedule_block_tracks bt join public.tracks t on t.id = bt.track_id
                         where bt.block_id = b.id order by t.sort_order) end,
         null::text, null::integer
  from public.schedule_blocks b
  where b.is_public
    and (b.event_id is null or not exists (select 1 from public.events e where e.id = b.event_id and e.is_published))
    and b.starts_at < app.local_ts(p_to + 1, '00:00') and b.ends_at > app.local_ts(p_from, '00:00')
  union all
  select 'track_status'::text, nullif(c.public_label, ''), null::timestamptz, null::timestamptz, c.day, c.status::text,
         array[t.slug], null::text, null::integer
  from public.track_access_calendar c
  join public.tracks t on t.id = c.track_id
  where c.day between p_from and p_to
  order by 5, 3 nulls last;
end;
$$;
