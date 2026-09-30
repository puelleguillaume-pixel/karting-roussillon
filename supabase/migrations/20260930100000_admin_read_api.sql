-- =============================================================================
-- Karting Roussillon — 15 · API de lecture de l'espace dirigeant (/admin)
-- Toutes les lectures du back-office passent par ces RPC (comme le site public) :
-- listes paginées, fiches détaillées, catalogue complet, paramètres, journal.
-- SECURITY DEFINER, search_path = '', contrôle du rôle dans chaque fonction.
-- =============================================================================

-- Pagination commune : limite bornée, décalage positif
create or replace function app.page_limit(p jsonb, p_default integer default 50)
returns integer language sql immutable
set search_path = ''
as $$ select least(greatest(coalesce((p ->> 'limit')::integer, p_default), 1), 200) $$;

create or replace function app.page_offset(p jsonb)
returns integer language sql immutable
set search_path = ''
as $$ select greatest(coalesce((p ->> 'offset')::integer, 0), 0) $$;

-- Motif de recherche insensible à la casse (null si vide)
create or replace function app.search_pattern(p_q text)
returns text language sql immutable
set search_path = ''
as $$
  select case when nullif(trim(coalesce(p_q, '')), '') is null then null
              else '%' || replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' end
$$;

-- Nom affiché d'un membre du personnel (journal, historique)
create or replace function app.staff_name(p_user_id uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select coalesce((select sr.display_name from public.staff_roles sr where sr.user_id = p_user_id),
                  (select u.email from auth.users u where u.id = p_user_id))
$$;

-- =============================================================================
-- Réservations
-- p = {q, status: [..], from, to, source, event_id, customer_id, outcome, order: 'asc'|'desc', limit, offset}
-- =============================================================================
create or replace function public.admin_list_bookings(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q       text := app.search_pattern(p ->> 'q');
  v_digits  text := regexp_replace(coalesce(p ->> 'q', ''), '\D', '', 'g');
  v_status  text[] := case when jsonb_typeof(p -> 'status') = 'array'
                           then array(select jsonb_array_elements_text(p -> 'status')) end;
  v_from    date := (p ->> 'from')::date;
  v_to      date := (p ->> 'to')::date;
  v_sign    integer := case when coalesce(p ->> 'order', 'asc') = 'desc' then -1 else 1 end;
  v_total   integer;
  v_rows    jsonb;
begin
  perform app.require_staff();
  with f as (
    select b.id, extract(epoch from b.starts_at) * v_sign as sort_key
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where (v_status is null or b.status::text = any (v_status))
      and (v_from is null or b.booking_date >= v_from)
      and (v_to is null or b.booking_date <= v_to)
      and (p ->> 'source' is null or b.source::text = p ->> 'source')
      and (p ->> 'event_id' is null or b.event_id = (p ->> 'event_id')::uuid)
      and (p ->> 'customer_id' is null or b.customer_id = (p ->> 'customer_id')::uuid)
      and (p ->> 'outcome' is null or b.cancellation_outcome = p ->> 'outcome')
      and (v_q is null
           or lower(b.reference) like v_q
           or lower(c.first_name || ' ' || c.last_name) like v_q
           or lower(c.last_name || ' ' || c.first_name) like v_q
           or lower(coalesce(c.email, '')) like v_q
           or (length(v_digits) >= 4 and regexp_replace(c.phone, '\D', '', 'g') like '%' || v_digits || '%'))
  ),
  page as (
    select * from f order by f.sort_key limit app.page_limit(p) offset app.page_offset(p)
  )
  select (select count(*) from f),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', b.id, 'reference', b.reference, 'status', b.status, 'source', b.source,
                    'starts_at', b.starts_at, 'booking_date', b.booking_date,
                    'product', pr.name, 'event', ev.title, 'event_id', b.event_id,
                    'customer', jsonb_build_object('id', c.id, 'name', trim(c.first_name || ' ' || c.last_name),
                                                   'email', c.email, 'phone', c.phone),
                    'karts', b.karts, 'participants_count', b.participants_count,
                    'total_cents', b.total_cents, 'gift_card_applied_cents', b.gift_card_applied_cents,
                    'paid_cents', app.booking_paid_cents(b.id),
                    'amount_due_cents', greatest(b.total_cents - b.gift_card_applied_cents - app.booking_paid_cents(b.id), 0),
                    'cancellation_outcome', b.cancellation_outcome, 'created_at', b.created_at,
                    'tracks', (select coalesce(jsonb_agg(distinct t.short_name), '[]'::jsonb)
                               from public.booking_sessions bs join public.slots sl on sl.id = bs.slot_id
                               join public.tracks t on t.id = sl.track_id where bs.booking_id = b.id))
                  order by pg.sort_key)
           from page pg
           join public.bookings b on b.id = pg.id
           join public.customers c on c.id = b.customer_id
           left join public.products pr on pr.id = b.product_id
           left join public.events ev on ev.id = b.event_id), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- Fiche complète : réservation + encaissements + mouvements de bons + historique
create or replace function public.admin_get_booking(p_booking_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_json jsonb;
begin
  perform app.require_staff();
  v_json := app.booking_json(p_booking_id, true);
  if v_json is null then
    perform app.fail('KR_BOOKING_NOT_FOUND', 'Réservation introuvable.');
  end if;
  return v_json || (
    select jsonb_build_object(
      'product_id', b.product_id,
      'vehicle_type_id', pr.vehicle_type_id,
      'sessions_required', coalesce(pk.sessions_count, 1),
      'vat_rate_bp', b.vat_rate_bp,
      'cancel_reason', b.cancel_reason, 'cancelled_at', b.cancelled_at,
      'terms_accepted_at', b.terms_accepted_at, 'waiver_version', b.waiver_version,
      'request_id', b.request_id,
      'customer', (v_json -> 'customer') || jsonb_build_object('id', b.customer_id),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object('id', pa.id, 'kind', pa.kind, 'method', pa.method, 'amount_cents', pa.amount_cents,
                                            'note', pa.note, 'paid_at', pa.paid_at, 'recorded_by', app.staff_name(pa.recorded_by))
                         order by pa.paid_at)
        from public.payments pa where pa.booking_id = b.id), '[]'::jsonb),
      'gift_card_transactions', coalesce((
        select jsonb_agg(jsonb_build_object('code', g.code, 'kind', t.kind, 'amount_cents', t.amount_cents,
                                            'created_at', t.created_at) order by t.created_at)
        from public.gift_card_transactions t join public.gift_cards g on g.id = t.gift_card_id
        where t.booking_id = b.id), '[]'::jsonb),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at,
                                            'actor', coalesce(app.staff_name(a.actor_id), 'Client'))
                         order by a.created_at desc)
        from public.audit_log a
        where (a.entity_id = b.id::text and a.entity in ('bookings', 'booking'))
           or (a.entity = 'payments' and a.entity_id in (select pa.id::text from public.payments pa where pa.booking_id = b.id))),
        '[]'::jsonb))
    from public.bookings b
    left join public.products pr on pr.id = b.product_id
    left join public.packs pk on pk.product_id = b.product_id
    where b.id = p_booking_id);
end;
$$;

-- Recherche check-in (QR ou référence) : même fiche complète que admin_get_booking
create or replace function public.admin_lookup_booking(p_code text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_staff();
  if p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.bookings where qr_token = p_code::uuid or id = p_code::uuid;
  else
    select id into v_id from public.bookings where reference = upper(trim(p_code));
  end if;
  if v_id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND', 'Aucune réservation pour ce code.');
  end if;
  return public.admin_get_booking(v_id)
         || jsonb_build_object('is_today', (select booking_date = app.local_date(now()) from public.bookings where id = v_id));
end;
$$;

-- Créneaux d'un jour pour une saisie au comptoir / téléphone : capacité totale
-- (hors quota en ligne), sans délai minimal, blocages signalés.
create or replace function public.admin_availability(p_product_id uuid, p_day date, p_karts integer default 1)
returns table (slot_id uuid, track_id uuid, track_name text, starts_at timestamptz, ends_at timestamptz,
               remaining integer, blocked boolean, available boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_ids     uuid[];
begin
  perform app.require_staff();
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null or v_product.vehicle_type_id is null then
    perform app.fail('KR_PRODUCT_NOT_BOOKABLE', 'Choisissez une session ou un pack.');
  end if;

  select array_agg(sl.id) into v_ids
  from public.slots sl
  join public.tracks t on t.id = sl.track_id
  join public.product_tracks pt on pt.track_id = sl.track_id and pt.product_id = p_product_id
  where sl.starts_at >= app.local_ts(p_day, '00:00') and sl.starts_at < app.local_ts(p_day + 1, '00:00')
    and sl.ends_at > now()
    and sl.is_active and t.is_active
    and exists (select 1 from public.slot_capacities sc
                where sc.slot_id = sl.id and sc.vehicle_type_id = v_product.vehicle_type_id and sc.capacity > 0);
  if v_ids is null then
    return;
  end if;

  return query
  select sl.id, t.id, t.short_name, sl.starts_at, sl.ends_at, r.remaining,
         app.is_blocked(sl.track_id, sl.starts_at, sl.ends_at),
         r.remaining >= greatest(p_karts, 1) and not app.is_blocked(sl.track_id, sl.starts_at, sl.ends_at)
  from app.slots_remaining(v_ids, v_product.vehicle_type_id, false) r
  join public.slots sl on sl.id = r.slot_id
  join public.tracks t on t.id = sl.track_id
  order by sl.starts_at, t.sort_order;
end;
$$;

-- =============================================================================
-- Demandes (pipeline)
-- p = {q, status: [..], type}
-- =============================================================================
create or replace function public.admin_list_requests(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q      text := app.search_pattern(p ->> 'q');
  v_status text[] := case when jsonb_typeof(p -> 'status') = 'array'
                          then array(select jsonb_array_elements_text(p -> 'status')) end;
begin
  perform app.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'reference', r.reference, 'type', r.type, 'status', r.status,
             'customer_id', r.customer_id, 'contact_name', r.contact_name, 'contact_email', r.contact_email,
             'contact_phone', r.contact_phone, 'company', r.company,
             'preferred_date', r.preferred_date, 'alternative_date', r.alternative_date,
             'participants_count', r.participants_count, 'message', r.message, 'details', r.details,
             'quote_amount_cents', r.quote_amount_cents, 'deposit_cents', r.deposit_cents,
             'internal_note', r.internal_note, 'product_id', r.product_id, 'product', pr.name,
             'assigned_to', r.assigned_to, 'assigned_name', app.staff_name(r.assigned_to),
             'status_changed_at', r.status_changed_at, 'created_at', r.created_at,
             'paid_cents', coalesce((select sum(case when pa.kind = 'payment' then pa.amount_cents else -pa.amount_cents end)
                                     from public.payments pa where pa.request_id = r.id), 0),
             'block', (select jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
                                                 'reason', b.reason, 'public_label', b.public_label)
                       from public.schedule_blocks b where b.id = r.schedule_block_id or b.request_id = r.id
                       order by (b.id = r.schedule_block_id) desc, b.starts_at limit 1))
           order by r.created_at desc)
    from public.requests r
    left join public.products pr on pr.id = r.product_id
    where (v_status is null or r.status::text = any (v_status))
      and (p ->> 'type' is null or r.type::text = p ->> 'type')
      and (v_q is null or lower(r.reference) like v_q or lower(r.contact_name) like v_q
           or lower(r.contact_email) like v_q or lower(r.company) like v_q)), '[]'::jsonb);
end;
$$;

-- =============================================================================
-- Bons cadeaux
-- p = {q, status: [..], limit, offset}
-- =============================================================================
create or replace function public.admin_list_gift_cards(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q      text := app.search_pattern(p ->> 'q');
  v_code   text := upper(regexp_replace(coalesce(p ->> 'q', ''), '[^A-Za-z0-9]', '', 'g'));
  v_status text[] := case when jsonb_typeof(p -> 'status') = 'array'
                          then array(select jsonb_array_elements_text(p -> 'status')) end;
  v_total  integer;
  v_rows   jsonb;
begin
  perform app.require_staff();
  with f as (
    select g.*
    from public.gift_cards g
    left join public.customers c on c.id = g.purchaser_customer_id
    where (v_status is null or g.status::text = any (v_status))
      and (v_q is null
           or (length(v_code) >= 4 and replace(g.code, '-', '') like '%' || v_code || '%')
           or lower(coalesce(g.order_reference, '')) like v_q
           or lower(g.recipient_name) like v_q
           or lower(coalesce(g.recipient_email, '')) like v_q
           or lower(coalesce(c.first_name || ' ' || c.last_name, '')) like v_q
           or lower(coalesce(c.email, '')) like v_q)
  ),
  page as (
    select * from f order by coalesce(f.ordered_at, f.created_at) desc
    limit app.page_limit(p) offset app.page_offset(p)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', g.id, 'code', g.code, 'kind', g.kind, 'source', g.source, 'status', g.status,
                     'product_id', g.product_id, 'product', pr.name,
                     'initial_amount_cents', g.initial_amount_cents, 'balance_cents', g.balance_cents,
                     'purchaser', case when c.id is not null then jsonb_build_object(
                                    'id', c.id, 'name', trim(c.first_name || ' ' || c.last_name), 'email', c.email, 'phone', c.phone) end,
                     'recipient_name', g.recipient_name, 'recipient_email', g.recipient_email, 'message', g.message,
                     'order_reference', g.order_reference, 'deliver_to', g.deliver_to,
                     'ordered_at', g.ordered_at, 'issued_at', g.issued_at, 'expires_at', g.expires_at,
                     'created_at', g.created_at) order by coalesce(g.ordered_at, g.created_at) desc)
                   from page g
                   left join public.products pr on pr.id = g.product_id
                   left join public.customers c on c.id = g.purchaser_customer_id), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_get_gift_card(p_gift_card_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_card jsonb;
begin
  perform app.require_staff();
  select jsonb_build_object(
           'id', g.id, 'code', g.code, 'kind', g.kind, 'source', g.source, 'status', g.status,
           'product_id', g.product_id, 'product', pr.name,
           'initial_amount_cents', g.initial_amount_cents, 'balance_cents', g.balance_cents,
           'purchaser', case when c.id is not null then jsonb_build_object(
                          'id', c.id, 'name', trim(c.first_name || ' ' || c.last_name), 'email', c.email, 'phone', c.phone) end,
           'recipient_name', g.recipient_name, 'recipient_email', g.recipient_email, 'message', g.message,
           'order_reference', g.order_reference, 'deliver_to', g.deliver_to,
           'ordered_at', g.ordered_at, 'issued_at', g.issued_at, 'expires_at', g.expires_at, 'created_at', g.created_at,
           'origin_booking', (select b.reference from public.bookings b where b.id = g.origin_booking_id),
           'created_by', app.staff_name(g.created_by),
           'transactions', coalesce((
             select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'amount_cents', t.amount_cents,
                                                 'balance_after_cents', t.balance_after_cents, 'note', t.note,
                                                 'booking_reference', b.reference, 'booking_id', b.id,
                                                 'created_at', t.created_at, 'created_by', app.staff_name(t.created_by))
                              order by t.created_at desc)
             from public.gift_card_transactions t left join public.bookings b on b.id = t.booking_id
             where t.gift_card_id = g.id), '[]'::jsonb),
           'payments', coalesce((
             select jsonb_agg(jsonb_build_object('kind', pa.kind, 'method', pa.method, 'amount_cents', pa.amount_cents,
                                                 'paid_at', pa.paid_at) order by pa.paid_at)
             from public.payments pa where pa.gift_card_id = g.id), '[]'::jsonb))
    into v_card
  from public.gift_cards g
  left join public.products pr on pr.id = g.product_id
  left join public.customers c on c.id = g.purchaser_customer_id
  where g.id = p_gift_card_id;
  if v_card is null then
    perform app.fail('KR_NOT_FOUND', 'Bon introuvable.');
  end if;
  return v_card;
end;
$$;

-- =============================================================================
-- Clients
-- p = {q, limit, offset}
-- =============================================================================
create or replace function public.admin_list_customers(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q      text := app.search_pattern(p ->> 'q');
  v_digits text := regexp_replace(coalesce(p ->> 'q', ''), '\D', '', 'g');
  v_total  integer;
  v_rows   jsonb;
begin
  perform app.require_staff();
  with f as (
    select c.*
    from public.customers c
    where v_q is null
       or lower(c.first_name || ' ' || c.last_name) like v_q
       or lower(c.last_name || ' ' || c.first_name) like v_q
       or lower(coalesce(c.email, '')) like v_q
       or lower(c.company) like v_q
       or (length(v_digits) >= 4 and regexp_replace(c.phone, '\D', '', 'g') like '%' || v_digits || '%')
  ),
  page as (
    select * from f order by f.last_name, f.first_name, f.created_at
    limit app.page_limit(p) offset app.page_offset(p)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email,
                     'phone', c.phone, 'company', c.company, 'birth_date', c.birth_date,
                     'chrono_validated', c.chrono_validated, 'anonymized', c.anonymized_at is not null,
                     'has_account', c.auth_user_id is not null, 'created_at', c.created_at,
                     'bookings_count', (select count(*) from public.bookings b where b.customer_id = c.id),
                     'last_booking_at', (select max(b.starts_at) from public.bookings b
                                         where b.customer_id = c.id and b.status <> 'cancelled'))
                     order by c.last_name, c.first_name, c.created_at)
                   from page c), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_get_customer(p_customer_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_json jsonb;
begin
  perform app.require_staff();
  select (to_jsonb(c) - 'pilot_key' - 'auth_user_id') || jsonb_build_object(
           'has_account', c.auth_user_id is not null,
           'chrono_validated_by', app.staff_name(c.chrono_validated_by),
           'paid_cents', coalesce((select sum(case when pa.kind = 'payment' then pa.amount_cents else -pa.amount_cents end)
                                   from public.payments pa
                                   left join public.bookings b on b.id = pa.booking_id
                                   left join public.requests r on r.id = pa.request_id
                                   left join public.gift_cards g on g.id = pa.gift_card_id
                                   where coalesce(b.customer_id, r.customer_id, g.purchaser_customer_id) = c.id), 0),
           'bookings', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', b.id, 'reference', b.reference, 'status', b.status, 'starts_at', b.starts_at,
                      'product', coalesce(pr.name, ev.title), 'karts', b.karts, 'participants_count', b.participants_count,
                      'total_cents', b.total_cents,
                      'amount_due_cents', greatest(b.total_cents - b.gift_card_applied_cents - app.booking_paid_cents(b.id), 0))
                    order by b.starts_at desc)
             from public.bookings b
             left join public.products pr on pr.id = b.product_id
             left join public.events ev on ev.id = b.event_id
             where b.customer_id = c.id), '[]'::jsonb),
           'requests', coalesce((
             select jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'type', r.type, 'status', r.status,
                                                 'preferred_date', r.preferred_date, 'created_at', r.created_at)
                              order by r.created_at desc)
             from public.requests r where r.customer_id = c.id), '[]'::jsonb),
           'gift_cards', coalesce((
             select jsonb_agg(jsonb_build_object('id', g.id, 'code', g.code, 'status', g.status, 'kind', g.kind,
                                                 'initial_amount_cents', g.initial_amount_cents, 'balance_cents', g.balance_cents,
                                                 'recipient_name', g.recipient_name, 'order_reference', g.order_reference,
                                                 'expires_at', g.expires_at)
                              order by coalesce(g.ordered_at, g.created_at) desc)
             from public.gift_cards g where g.purchaser_customer_id = c.id), '[]'::jsonb),
           'lap_records', coalesce((
             select jsonb_agg(jsonb_build_object('id', l.id, 'track', t.short_name, 'category_label', l.category_label,
                                                 'lap_time_ms', l.lap_time_ms, 'recorded_on', l.recorded_on)
                              order by l.recorded_on desc)
             from public.lap_records l join public.tracks t on t.id = l.track_id
             where l.customer_id = c.id), '[]'::jsonb))
    into v_json
  from public.customers c where c.id = p_customer_id;
  if v_json is null then
    perform app.fail('KR_NOT_FOUND', 'Client introuvable.');
  end if;
  return v_json;
end;
$$;

-- Création d'une fiche client au comptoir (sans email possible)
create or replace function public.admin_create_customer(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_staff();
  if nullif(trim(coalesce(p ->> 'last_name', '')), '') is null then
    perform app.fail('KR_CUSTOMER_INCOMPLETE', 'Le nom est obligatoire.');
  end if;
  if nullif(trim(coalesce(p ->> 'email', '')), '') is not null
     and exists (select 1 from public.customers where lower(email) = lower(trim(p ->> 'email'))) then
    perform app.fail('KR_CUSTOMER_EXISTS', 'Un client existe déjà avec cet email.');
  end if;
  insert into public.customers (email, first_name, last_name, phone, company, birth_date, internal_notes)
  values (nullif(trim(coalesce(p ->> 'email', '')), ''), trim(coalesce(p ->> 'first_name', '')), trim(p ->> 'last_name'),
          trim(coalesce(p ->> 'phone', '')), trim(coalesce(p ->> 'company', '')), (p ->> 'birth_date')::date,
          coalesce(p ->> 'internal_notes', ''))
  returning id into v_id;
  perform app.audit('customer_create', 'customers', v_id::text, null, p);
  return v_id;
end;
$$;

-- =============================================================================
-- Événements, blocages, statuts de piste
-- =============================================================================
create or replace function public.admin_list_events(p_include_past boolean default false)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return coalesce((
    select jsonb_agg(to_jsonb(e) || jsonb_build_object(
             'track_ids', (select coalesce(jsonb_agg(et.track_id), '[]'::jsonb) from public.event_tracks et where et.event_id = e.id),
             'booked', (select coalesce(sum(b.participants_count), 0) from public.bookings b
                        where b.event_id = e.id and app.is_active_status(b.status)),
             'bookings_count', (select count(*) from public.bookings b where b.event_id = e.id and app.is_active_status(b.status)),
             'block_id', (select b.id from public.schedule_blocks b where b.event_id = e.id order by b.starts_at limit 1))
           order by case when p_include_past then null else e.starts_at end asc, e.starts_at desc)
    from public.events e
    where p_include_past or e.ends_at > now()), '[]'::jsonb);
end;
$$;

-- p_from / p_to : dates locales (366 jours max)
create or replace function public.admin_list_blocks(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_to < p_from or p_to - p_from > 366 then
    perform app.fail('KR_RANGE_INVALID', 'Période d''un an maximum.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'series_id', b.series_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
             'block_type', b.block_type, 'reason', b.reason, 'public_label', b.public_label, 'is_public', b.is_public,
             'all_tracks', b.all_tracks, 'recurrence_rule', b.recurrence_rule, 'internal_note', b.internal_note,
             'track_ids', (select coalesce(jsonb_agg(bt.track_id), '[]'::jsonb) from public.schedule_block_tracks bt where bt.block_id = b.id),
             'series_count', (select count(*) from public.schedule_blocks s where s.series_id = b.series_id),
             'series_future_count', (select count(*) from public.schedule_blocks s where s.series_id = b.series_id and s.ends_at > now()),
             'event', (select jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug) from public.events e where e.id = b.event_id),
             'request', (select jsonb_build_object('id', r.id, 'reference', r.reference, 'type', r.type) from public.requests r where r.id = b.request_id),
             'customer', (select jsonb_build_object('id', c.id, 'name', trim(c.first_name || ' ' || c.last_name), 'company', c.company)
                          from public.customers c where c.id = b.customer_id),
             'created_by', app.staff_name(b.created_by), 'created_at', b.created_at,
             'kept_bookings', (select count(*) from app.block_conflicts(array[tstzrange(b.starts_at, b.ends_at, '[)')],
                                                                         array(select bt.track_id from public.schedule_block_tracks bt where bt.block_id = b.id),
                                                                         b.all_tracks)))
           order by b.starts_at)
    from public.schedule_blocks b
    where b.starts_at < app.local_ts(p_to + 1, '00:00') and b.ends_at > app.local_ts(p_from, '00:00')), '[]'::jsonb);
end;
$$;

-- Vue mensuelle du planning : une ligne par jour (remplissage, réservations,
-- blocages et événements qui touchent la journée). 62 jours max.
create or replace function public.admin_planning_summary(p_from date, p_to date, p_track_ids uuid[] default null)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_to < p_from or p_to - p_from > 62 then
    perform app.fail('KR_RANGE_INVALID', 'Période de 62 jours maximum.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'day', d.day,
             'capacity', coalesce(u.capacity, 0),
             'booked', coalesce(u.booked, 0),
             'bookings_count', (select count(*) from public.bookings b
                                where b.booking_date = d.day and app.is_active_status(b.status) and b.product_id is not null
                                  and (p_track_ids is null or exists (
                                        select 1 from public.booking_sessions bs join public.slots sl on sl.id = bs.slot_id
                                        where bs.booking_id = b.id and sl.track_id = any (p_track_ids)))),
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
                                                   'block_type', b.block_type, 'reason', b.reason,
                                                   'public_label', b.public_label, 'all_tracks', b.all_tracks,
                                                   'track_ids', (select coalesce(jsonb_agg(bt.track_id), '[]'::jsonb)
                                                                 from public.schedule_block_tracks bt where bt.block_id = b.id))
                                order by b.starts_at)
               from public.schedule_blocks b
               where b.starts_at < app.local_ts(d.day + 1, '00:00') and b.ends_at > app.local_ts(d.day, '00:00')
                 and (p_track_ids is null or b.all_tracks
                      or exists (select 1 from public.schedule_block_tracks bt where bt.block_id = b.id and bt.track_id = any (p_track_ids)))),
               '[]'::jsonb),
             'events', coalesce((
               select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'capacity', e.capacity,
                                                   'booked', (select coalesce(sum(b.participants_count), 0) from public.bookings b
                                                              where b.event_id = e.id and app.is_active_status(b.status)))
                                order by e.starts_at)
               from public.events e
               where e.starts_at < app.local_ts(d.day + 1, '00:00') and e.ends_at > app.local_ts(d.day, '00:00')),
               '[]'::jsonb))
           order by d.day)
    from (select g::date as day from generate_series(p_from, p_to, interval '1 day') g) d
    left join lateral (
      select sum(sc.capacity) as capacity,
             sum((select coalesce(sum(bs.karts), 0) from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
                  where bs.slot_id = sl.id and bs.vehicle_type_id = sc.vehicle_type_id and app.is_active_status(b.status))) as booked
      from public.slots sl
      join public.slot_capacities sc on sc.slot_id = sl.id
      where sl.starts_at >= app.local_ts(d.day, '00:00') and sl.starts_at < app.local_ts(d.day + 1, '00:00')
        and sl.is_active and (p_track_ids is null or sl.track_id = any (p_track_ids))) u on true), '[]'::jsonb);
end;
$$;

create or replace function public.admin_track_access(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_to < p_from or p_to - p_from > 400 then
    perform app.fail('KR_RANGE_INVALID');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('track_id', a.track_id, 'day', a.day, 'status', a.status, 'public_label', a.public_label)
                     order by a.day)
    from public.track_access_calendar a where a.day between p_from and p_to), '[]'::jsonb);
end;
$$;

-- =============================================================================
-- Catalogue complet (actifs et inactifs) et disponibilités
-- Lecture ouverte au personnel (saisie au comptoir) ; écriture réservée au dirigeant.
-- =============================================================================
create or replace function public.admin_catalog()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return jsonb_build_object(
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.name) from public.tracks t), '[]'::jsonb),
    'vehicle_types', coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.name) from public.vehicle_types v), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(x) || jsonb_build_object(
               'track_ids', (select coalesce(jsonb_agg(pt.track_id), '[]'::jsonb) from public.product_tracks pt where pt.product_id = x.id),
               'pack', (select to_jsonb(pk) - 'product_id' from public.packs pk where pk.product_id = x.id))
             order by x.sort_order, x.name)
      from public.products x), '[]'::jsonb),
    'capacities', coalesce((select jsonb_agg(to_jsonb(c)) from public.track_vehicle_capacities c), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(o) order by o.track_id nulls first, o.priority desc, o.weekday, o.opens_at)
                               from public.opening_hours o), '[]'::jsonb));
end;
$$;

-- =============================================================================
-- Contenu, avis, chronos (staff)
-- =============================================================================
create or replace function public.admin_list_content()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', s.key, 'title', s.title, 'body', s.body, 'data', s.data,
                                        'is_published', s.is_published, 'updated_at', s.updated_at,
                                        'updated_by', app.staff_name(s.updated_by))
                     order by s.key)
    from public.site_content s), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_reviews()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.review_date desc nulls last, r.created_at desc)
                   from public.reviews r), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_lap_records()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return coalesce((
    select jsonb_agg(to_jsonb(l) - 'created_by' || jsonb_build_object(
             'track', t.short_name,
             'customer_name', (select trim(c.first_name || ' ' || c.last_name) from public.customers c where c.id = l.customer_id))
           order by t.sort_order, l.category_label, l.lap_time_ms)
    from public.lap_records l join public.tracks t on t.id = l.track_id), '[]'::jsonb);
end;
$$;

-- =============================================================================
-- Paramètres, personnel, journal (owner)
-- =============================================================================
create or replace function public.admin_settings()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'description', s.description,
                                        'is_public', s.is_public, 'updated_at', s.updated_at,
                                        'updated_by', app.staff_name(s.updated_by))
                     order by s.key)
    from public.settings s), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_staff()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', sr.user_id, 'email', u.email, 'role', sr.role,
                                        'display_name', sr.display_name, 'is_active', sr.is_active,
                                        'created_at', sr.created_at, 'is_me', sr.user_id = auth.uid())
                     order by sr.is_active desc, sr.role, sr.display_name)
    from public.staff_roles sr left join auth.users u on u.id = sr.user_id), '[]'::jsonb);
end;
$$;

-- Ajout d'un membre : la personne doit s'être connectée une fois (compte Auth existant)
create or replace function public.admin_add_staff(p_email text, p_role public.app_role, p_display_name text)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform app.require_owner();
  if nullif(trim(coalesce(p_display_name, '')), '') is null then
    perform app.fail('KR_STAFF_NAME_REQUIRED', 'Indiquez le nom affiché.');
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    perform app.fail('KR_USER_NOT_FOUND',
      'Aucun compte pour cet email : la personne doit d''abord demander un lien de connexion sur la page /admin.');
  end if;
  if exists (select 1 from public.staff_roles where user_id = v_user) then
    perform app.fail('KR_STAFF_EXISTS', 'Cette personne fait déjà partie de l''équipe.');
  end if;
  perform public.admin_set_staff_role(v_user, p_role, trim(p_display_name), true);
  return v_user;
end;
$$;

-- p = {entity, action, q, limit, offset}
create or replace function public.admin_list_audit(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q     text := app.search_pattern(p ->> 'q');
  v_total integer;
  v_rows  jsonb;
begin
  perform app.require_owner();
  with f as (
    select a.* from public.audit_log a
    where (p ->> 'entity' is null or a.entity = p ->> 'entity')
      and (p ->> 'action' is null or a.action like (p ->> 'action') || '%')
      and (v_q is null or lower(a.action) like v_q or lower(coalesce(a.entity_id, '')) like v_q
           or lower(coalesce(a.after_data::text, '')) like v_q)
  ),
  page as (
    select * from f order by f.created_at desc, f.id desc
    limit app.page_limit(p) offset app.page_offset(p)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.id, 'created_at', a.created_at, 'actor', app.staff_name(a.actor_id), 'actor_role', a.actor_role,
                     'action', a.action, 'entity', a.entity, 'entity_id', a.entity_id,
                     'before', a.before_data, 'after', a.after_data)
                     order by a.created_at desc, a.id desc)
                   from page a), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- =============================================================================
-- Droits d'exécution : authenticated, le rôle est vérifié dans chaque fonction
-- =============================================================================
revoke execute on function app.page_limit(jsonb, integer), app.page_offset(jsonb), app.search_pattern(text),
                           app.staff_name(uuid)
  from public, anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;
