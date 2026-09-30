-- =============================================================================
-- Karting Roussillon — 09 · RPC de l'espace dirigeant (/admin)
-- Toutes : SECURITY DEFINER, search_path = '', contrôle de rôle, audit.
--   owner : tout
--   staff : exploitation (planning, check-in, réservations, blocages, demandes,
--           chronos, contenu) — pas de CA, pas de paramètres, pas de catalogue.
-- =============================================================================

-- Profil du membre connecté (routage front)
create or replace function public.admin_me()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('user_id', sr.user_id, 'role', sr.role, 'display_name', sr.display_name)
  from public.staff_roles sr where sr.user_id = auth.uid() and sr.is_active
$$;

-- =============================================================================
-- Paramètres & personnel (owner)
-- =============================================================================
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform app.require_owner();
  select value into v_before from public.settings where key = p_key for update;
  if not found then
    perform app.fail('KR_SETTING_UNKNOWN', 'Paramètre inconnu : ' || p_key);
  end if;
  update public.settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform app.audit('setting_update', 'settings', p_key, v_before, p_value);
end;
$$;

create or replace function public.admin_set_staff_role(p_user_id uuid, p_role public.app_role, p_display_name text, p_active boolean default true)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform app.require_owner();
  select to_jsonb(sr) into v_before from public.staff_roles sr where sr.user_id = p_user_id;
  if (v_before ->> 'role') = 'owner' and (p_role <> 'owner' or not p_active)
     and (select count(*) from public.staff_roles where role = 'owner' and is_active) <= 1 then
    perform app.fail('KR_LAST_OWNER', 'Impossible de retirer le dernier dirigeant.');
  end if;
  insert into public.staff_roles (user_id, role, display_name, is_active)
  values (p_user_id, p_role, p_display_name, p_active)
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name, is_active = excluded.is_active;
  perform app.audit('staff_role_set', 'staff_roles', p_user_id::text, v_before,
                    jsonb_build_object('role', p_role, 'display_name', p_display_name, 'is_active', p_active));
end;
$$;

-- =============================================================================
-- Catalogue (owner)
-- =============================================================================
create or replace function public.admin_upsert_track(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_before jsonb;
begin
  perform app.require_owner();
  if v_id is null then
    insert into public.tracks (slug, name, short_name, length_m, usage, min_age, description, requires_booking,
                               online_booking_enabled, enforce_run_groups, max_karts_on_track, slot_interval_min,
                               session_min, display_on_circuits, image_path, sort_order, is_active)
    values (p ->> 'slug', p ->> 'name', coalesce(p ->> 'short_name', p ->> 'name'), (p ->> 'length_m')::integer,
            (p ->> 'usage')::public.track_usage, (p ->> 'min_age')::integer, coalesce(p ->> 'description', ''),
            coalesce((p ->> 'requires_booking')::boolean, false), coalesce((p ->> 'online_booking_enabled')::boolean, true),
            coalesce((p ->> 'enforce_run_groups')::boolean, true), (p ->> 'max_karts_on_track')::integer,
            coalesce((p ->> 'slot_interval_min')::integer, 15), coalesce((p ->> 'session_min')::integer, 10),
            coalesce((p ->> 'display_on_circuits')::boolean, true), p ->> 'image_path',
            coalesce((p ->> 'sort_order')::integer, 0), coalesce((p ->> 'is_active')::boolean, true))
    returning id into v_id;
  else
    select to_jsonb(t) into v_before from public.tracks t where t.id = v_id for update;
    if v_before is null then perform app.fail('KR_NOT_FOUND'); end if;
    update public.tracks t set
      slug = coalesce(p ->> 'slug', t.slug),
      name = coalesce(p ->> 'name', t.name),
      short_name = coalesce(p ->> 'short_name', t.short_name),
      length_m = case when p ? 'length_m' then (p ->> 'length_m')::integer else t.length_m end,
      usage = coalesce((p ->> 'usage')::public.track_usage, t.usage),
      min_age = case when p ? 'min_age' then (p ->> 'min_age')::integer else t.min_age end,
      description = coalesce(p ->> 'description', t.description),
      requires_booking = coalesce((p ->> 'requires_booking')::boolean, t.requires_booking),
      online_booking_enabled = coalesce((p ->> 'online_booking_enabled')::boolean, t.online_booking_enabled),
      enforce_run_groups = coalesce((p ->> 'enforce_run_groups')::boolean, t.enforce_run_groups),
      max_karts_on_track = case when p ? 'max_karts_on_track' then (p ->> 'max_karts_on_track')::integer else t.max_karts_on_track end,
      slot_interval_min = coalesce((p ->> 'slot_interval_min')::integer, t.slot_interval_min),
      session_min = coalesce((p ->> 'session_min')::integer, t.session_min),
      display_on_circuits = coalesce((p ->> 'display_on_circuits')::boolean, t.display_on_circuits),
      image_path = case when p ? 'image_path' then p ->> 'image_path' else t.image_path end,
      sort_order = coalesce((p ->> 'sort_order')::integer, t.sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, t.is_active)
    where t.id = v_id;
  end if;
  perform app.audit(case when v_before is null then 'track_create' else 'track_update' end, 'tracks', v_id::text,
                    v_before, (select to_jsonb(t) from public.tracks t where t.id = v_id));
  return v_id;
end;
$$;

create or replace function public.admin_upsert_vehicle_type(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_before jsonb;
begin
  perform app.require_owner();
  if v_id is null then
    insert into public.vehicle_types (slug, name, engine, description, min_age, min_height_cm, seats, passenger_min_age,
                                      passenger_min_height_cm, is_adapted, run_group, fleet_count, image_path, sort_order, is_active)
    values (p ->> 'slug', p ->> 'name', coalesce(p ->> 'engine', ''), coalesce(p ->> 'description', ''),
            coalesce((p ->> 'min_age')::integer, 0), (p ->> 'min_height_cm')::integer, coalesce((p ->> 'seats')::integer, 1),
            (p ->> 'passenger_min_age')::integer, (p ->> 'passenger_min_height_cm')::integer,
            coalesce((p ->> 'is_adapted')::boolean, false), coalesce(p ->> 'run_group', 'loisir'),
            coalesce((p ->> 'fleet_count')::integer, 0), p ->> 'image_path',
            coalesce((p ->> 'sort_order')::integer, 0), coalesce((p ->> 'is_active')::boolean, true))
    returning id into v_id;
  else
    select to_jsonb(v) into v_before from public.vehicle_types v where v.id = v_id for update;
    if v_before is null then perform app.fail('KR_NOT_FOUND'); end if;
    update public.vehicle_types v set
      slug = coalesce(p ->> 'slug', v.slug),
      name = coalesce(p ->> 'name', v.name),
      engine = coalesce(p ->> 'engine', v.engine),
      description = coalesce(p ->> 'description', v.description),
      min_age = coalesce((p ->> 'min_age')::integer, v.min_age),
      min_height_cm = case when p ? 'min_height_cm' then (p ->> 'min_height_cm')::integer else v.min_height_cm end,
      seats = coalesce((p ->> 'seats')::integer, v.seats),
      passenger_min_age = case when p ? 'passenger_min_age' then (p ->> 'passenger_min_age')::integer else v.passenger_min_age end,
      passenger_min_height_cm = case when p ? 'passenger_min_height_cm' then (p ->> 'passenger_min_height_cm')::integer else v.passenger_min_height_cm end,
      is_adapted = coalesce((p ->> 'is_adapted')::boolean, v.is_adapted),
      run_group = coalesce(p ->> 'run_group', v.run_group),
      fleet_count = coalesce((p ->> 'fleet_count')::integer, v.fleet_count),
      image_path = case when p ? 'image_path' then p ->> 'image_path' else v.image_path end,
      sort_order = coalesce((p ->> 'sort_order')::integer, v.sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, v.is_active)
    where v.id = v_id;
  end if;
  perform app.audit(case when v_before is null then 'vehicle_type_create' else 'vehicle_type_update' end,
                    'vehicle_types', v_id::text, v_before,
                    (select to_jsonb(v) from public.vehicle_types v where v.id = v_id));
  return v_id;
end;
$$;

-- Produit + pistes (p.track_ids) + détail pack (p.pack)
create or replace function public.admin_upsert_product(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_before jsonb;
  v_kind   public.product_kind;
begin
  perform app.require_owner();
  if v_id is null then
    insert into public.products (slug, kind, name, short_description, description, vehicle_type_id, request_type,
                                 price_cents, price_label, vat_rate_bp, duration_min, min_age, min_height_cm, age_label,
                                 requires_chrono_validation, is_online_bookable, active_months, metadata, image_path,
                                 is_featured, sort_order, is_active)
    values (p ->> 'slug', (p ->> 'kind')::public.product_kind, p ->> 'name', coalesce(p ->> 'short_description', ''),
            coalesce(p ->> 'description', ''), nullif(p ->> 'vehicle_type_id', '')::uuid,
            (p ->> 'request_type')::public.request_type, (p ->> 'price_cents')::integer, p ->> 'price_label',
            coalesce((p ->> 'vat_rate_bp')::integer, 2000), (p ->> 'duration_min')::integer, (p ->> 'min_age')::integer,
            (p ->> 'min_height_cm')::integer, coalesce(p ->> 'age_label', ''),
            coalesce((p ->> 'requires_chrono_validation')::boolean, false),
            coalesce((p ->> 'is_online_bookable')::boolean, false),
            case when jsonb_typeof(p -> 'active_months') = 'array'
                 then array(select jsonb_array_elements_text(p -> 'active_months')::smallint) end,
            coalesce(p -> 'metadata', '{}'::jsonb), p ->> 'image_path',
            coalesce((p ->> 'is_featured')::boolean, false), coalesce((p ->> 'sort_order')::integer, 0),
            coalesce((p ->> 'is_active')::boolean, true))
    returning id into v_id;
  else
    select to_jsonb(x) into v_before from public.products x where x.id = v_id for update;
    if v_before is null then perform app.fail('KR_NOT_FOUND'); end if;
    update public.products x set
      slug = coalesce(p ->> 'slug', x.slug),
      name = coalesce(p ->> 'name', x.name),
      short_description = coalesce(p ->> 'short_description', x.short_description),
      description = coalesce(p ->> 'description', x.description),
      vehicle_type_id = case when p ? 'vehicle_type_id' then nullif(p ->> 'vehicle_type_id', '')::uuid else x.vehicle_type_id end,
      request_type = case when p ? 'request_type' then (p ->> 'request_type')::public.request_type else x.request_type end,
      price_cents = case when p ? 'price_cents' then (p ->> 'price_cents')::integer else x.price_cents end,
      price_label = case when p ? 'price_label' then p ->> 'price_label' else x.price_label end,
      vat_rate_bp = coalesce((p ->> 'vat_rate_bp')::integer, x.vat_rate_bp),
      duration_min = case when p ? 'duration_min' then (p ->> 'duration_min')::integer else x.duration_min end,
      min_age = case when p ? 'min_age' then (p ->> 'min_age')::integer else x.min_age end,
      min_height_cm = case when p ? 'min_height_cm' then (p ->> 'min_height_cm')::integer else x.min_height_cm end,
      age_label = coalesce(p ->> 'age_label', x.age_label),
      requires_chrono_validation = coalesce((p ->> 'requires_chrono_validation')::boolean, x.requires_chrono_validation),
      is_online_bookable = coalesce((p ->> 'is_online_bookable')::boolean, x.is_online_bookable),
      active_months = case when p ? 'active_months' then
                        case when jsonb_typeof(p -> 'active_months') = 'array'
                             then array(select jsonb_array_elements_text(p -> 'active_months')::smallint) end
                      else x.active_months end,
      metadata = coalesce(p -> 'metadata', x.metadata),
      image_path = case when p ? 'image_path' then p ->> 'image_path' else x.image_path end,
      is_featured = coalesce((p ->> 'is_featured')::boolean, x.is_featured),
      sort_order = coalesce((p ->> 'sort_order')::integer, x.sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, x.is_active)
    where x.id = v_id;
  end if;

  if jsonb_typeof(p -> 'track_ids') = 'array' then
    delete from public.product_tracks where product_id = v_id;
    insert into public.product_tracks (product_id, track_id)
    select v_id, t::uuid from jsonb_array_elements_text(p -> 'track_ids') t;
  end if;

  select kind into v_kind from public.products where id = v_id;
  if v_kind = 'pack' then
    if p ? 'pack' then
      insert into public.packs (product_id, sessions_count, session_min, min_gap_min, same_day)
      values (v_id, (p #>> '{pack,sessions_count}')::integer, (p #>> '{pack,session_min}')::integer,
              coalesce((p #>> '{pack,min_gap_min}')::integer, 0), coalesce((p #>> '{pack,same_day}')::boolean, true))
      on conflict (product_id) do update set
        sessions_count = excluded.sessions_count, session_min = excluded.session_min,
        min_gap_min = excluded.min_gap_min, same_day = excluded.same_day;
    elsif not exists (select 1 from public.packs where product_id = v_id) then
      perform app.fail('KR_PRODUCT_MISCONFIGURED', 'Un pack doit préciser son nombre de sessions.');
    end if;
  end if;

  perform app.audit(case when v_before is null then 'product_create' else 'product_update' end, 'products', v_id::text,
                    v_before, (select to_jsonb(x) from public.products x where x.id = v_id));
  return v_id;
end;
$$;

-- Capacité modèle d'une catégorie sur une piste ; p_apply_future régénère les créneaux à venir.
create or replace function public.admin_set_track_capacity(
  p_track_id uuid, p_vehicle_type_id uuid, p_capacity integer, p_online_quota_pct integer default null,
  p_apply_future boolean default true)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_owner();
  if p_capacity is null or p_capacity <= 0 then
    delete from public.track_vehicle_capacities where track_id = p_track_id and vehicle_type_id = p_vehicle_type_id;
  else
    insert into public.track_vehicle_capacities (track_id, vehicle_type_id, capacity, online_quota_pct)
    values (p_track_id, p_vehicle_type_id, p_capacity, p_online_quota_pct)
    on conflict (track_id, vehicle_type_id) do update set capacity = excluded.capacity, online_quota_pct = excluded.online_quota_pct;
  end if;
  perform app.audit('track_capacity_set', 'track_vehicle_capacities', p_track_id::text || '/' || p_vehicle_type_id::text, null,
                    jsonb_build_object('capacity', p_capacity, 'online_quota_pct', p_online_quota_pct));
  if p_apply_future then
    perform app.generate_slots(app.local_date(now()),
                               app.local_date(now()) + app.setting_int('slot_generation_horizon_days', 120));
  end if;
end;
$$;

-- =============================================================================
-- Disponibilités : horaires, créneaux, capacités ponctuelles, statuts de piste
-- =============================================================================
create or replace function public.admin_upsert_opening_hours(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require_owner();
  if v_id is null then
    insert into public.opening_hours (track_id, weekday, opens_at, closes_at, is_closed, valid_from, valid_to, priority, label)
    values (nullif(p ->> 'track_id', '')::uuid, (p ->> 'weekday')::smallint, (p ->> 'opens_at')::time, (p ->> 'closes_at')::time,
            coalesce((p ->> 'is_closed')::boolean, false), (p ->> 'valid_from')::date, (p ->> 'valid_to')::date,
            coalesce((p ->> 'priority')::integer, 0), coalesce(p ->> 'label', ''))
    returning id into v_id;
  else
    update public.opening_hours set
      track_id = nullif(p ->> 'track_id', '')::uuid, weekday = (p ->> 'weekday')::smallint,
      opens_at = (p ->> 'opens_at')::time, closes_at = (p ->> 'closes_at')::time,
      is_closed = coalesce((p ->> 'is_closed')::boolean, false), valid_from = (p ->> 'valid_from')::date,
      valid_to = (p ->> 'valid_to')::date, priority = coalesce((p ->> 'priority')::integer, 0),
      label = coalesce(p ->> 'label', '')
    where id = v_id;
  end if;
  perform app.audit('opening_hours_upsert', 'opening_hours', v_id::text, null, p);
  return v_id;
end;
$$;

create or replace function public.admin_delete_opening_hours(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  perform app.require_owner();
  delete from public.opening_hours oh where oh.id = p_id returning to_jsonb(oh) into v_before;
  perform app.audit('opening_hours_delete', 'opening_hours', p_id::text, v_before, null);
end;
$$;

create or replace function public.admin_generate_slots(p_from date, p_to date)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare v_n integer;
begin
  perform app.require_staff();
  v_n := app.generate_slots(p_from, p_to);
  perform app.audit('slots_generate', 'slots', null, null, jsonb_build_object('from', p_from, 'to', p_to, 'upserted', v_n));
  return v_n;
end;
$$;

-- Capacité ponctuelle d'un créneau (ex. karts en maintenance)
create or replace function public.admin_set_slot_capacity(p_slot_id uuid, p_vehicle_type_id uuid, p_capacity integer, p_online_capacity integer)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  perform 1 from public.slots where id = p_slot_id for update;
  insert into public.slot_capacities (slot_id, vehicle_type_id, capacity, online_capacity, is_override)
  values (p_slot_id, p_vehicle_type_id, p_capacity, least(p_online_capacity, p_capacity), true)
  on conflict (slot_id, vehicle_type_id) do update
    set capacity = excluded.capacity, online_capacity = excluded.online_capacity, is_override = true;
  perform app.audit('slot_capacity_set', 'slots', p_slot_id::text, null,
                    jsonb_build_object('vehicle_type_id', p_vehicle_type_id, 'capacity', p_capacity, 'online_capacity', p_online_capacity));
end;
$$;

create or replace function public.admin_set_slot_active(p_slot_id uuid, p_active boolean)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  update public.slots set is_active = p_active where id = p_slot_id;
  perform app.audit(case when p_active then 'slot_open' else 'slot_close' end, 'slots', p_slot_id::text, null, null);
end;
$$;

-- Statut public droits de piste sur une période
create or replace function public.admin_set_track_access_status(
  p_track_ids uuid[], p_from date, p_to date, p_status public.track_access_status, p_public_label text default '')
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare v_n integer;
begin
  perform app.require_staff();
  if p_to < p_from or p_to - p_from > 400 then
    perform app.fail('KR_RANGE_INVALID');
  end if;
  insert into public.track_access_calendar (track_id, day, status, public_label, updated_by, updated_at)
  select t, d::date, p_status, coalesce(p_public_label, ''), auth.uid(), now()
  from unnest(p_track_ids) t, generate_series(p_from, p_to, interval '1 day') d
  on conflict (track_id, day) do update
    set status = excluded.status, public_label = excluded.public_label, updated_by = excluded.updated_by, updated_at = now();
  get diagnostics v_n = row_count;
  perform app.audit('track_access_status_set', 'track_access_calendar', null, null,
                    jsonb_build_object('tracks', p_track_ids, 'from', p_from, 'to', p_to, 'status', p_status, 'label', p_public_label));
  return v_n;
end;
$$;

create or replace function public.admin_clear_track_access_status(p_track_ids uuid[], p_from date, p_to date)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare v_n integer;
begin
  perform app.require_staff();
  delete from public.track_access_calendar where track_id = any (p_track_ids) and day between p_from and p_to;
  get diagnostics v_n = row_count;
  perform app.audit('track_access_status_clear', 'track_access_calendar', null, null,
                    jsonb_build_object('tracks', p_track_ids, 'from', p_from, 'to', p_to));
  return v_n;
end;
$$;

-- =============================================================================
-- Blocages & privatisations (staff)
-- Entrée p :
--   block_type  full_day | morning | afternoon | custom
--   date        (si non custom)          starts_at / ends_at (si custom)
--   track_ids   [uuid] ou all_tracks = true
--   reason, public_label, is_public, recurrence_rule, internal_note,
--   customer_id, request_id, event_id
-- =============================================================================

-- Aperçu : occurrences + réservations impactées, sans rien écrire.
create or replace function public.admin_preview_block(p jsonb, p_exclude_series uuid default null)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v record;
begin
  perform app.require_staff();
  select * into v from app.parse_block_input(p);
  return jsonb_build_object(
    'occurrences', (select jsonb_agg(jsonb_build_object('starts_at', lower(r), 'ends_at', upper(r))) from unnest(v.ranges) r),
    'conflicts', coalesce((select jsonb_agg(to_jsonb(c)) from app.block_conflicts(v.ranges, v.track_ids, v.all_tracks) c), '[]'::jsonb),
    'warning_hours', app.setting_int('block_warning_hours', 72));
end;
$$;

-- Création. S'il existe des réservations impactées et que p_conflict_actions
-- est null, la RPC échoue (KR_BLOCK_HAS_CONFLICTS) : l'UI doit d'abord
-- présenter la liste et faire choisir conserver / déplacer / annuler.
create or replace function public.admin_create_block(p jsonb, p_conflict_actions jsonb default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v         record;
  v_series  uuid := gen_random_uuid();
  v_ids     uuid[] := '{}';
  v_id      uuid;
  r         tstzrange;
  v_conf    uuid[];
  v_actions jsonb;
begin
  perform app.require_staff();
  select * into v from app.parse_block_input(p);

  perform app.lock_slots_in_ranges(v.ranges, v.track_ids, v.all_tracks);
  v_conf := array(select c.booking_id from app.block_conflicts(v.ranges, v.track_ids, v.all_tracks) c);
  if cardinality(v_conf) > 0 and p_conflict_actions is null then
    perform app.fail('KR_BLOCK_HAS_CONFLICTS',
      format('%s réservation(s) sur cette plage : choisissez une action.', cardinality(v_conf)),
      cardinality(v_conf)::text);
  end if;

  foreach r in array v.ranges loop
    insert into public.schedule_blocks (series_id, starts_at, ends_at, block_type, reason, public_label, is_public,
                                        all_tracks, recurrence_rule, event_id, request_id, customer_id, internal_note,
                                        created_by, updated_by)
    values (v_series, lower(r), upper(r), (p ->> 'block_type')::public.block_type, (p ->> 'reason')::public.block_reason,
            nullif(trim(coalesce(p ->> 'public_label', '')), ''), coalesce((p ->> 'is_public')::boolean, false),
            v.all_tracks, nullif(p ->> 'recurrence_rule', ''), nullif(p ->> 'event_id', '')::uuid,
            nullif(p ->> 'request_id', '')::uuid, nullif(p ->> 'customer_id', '')::uuid,
            coalesce(p ->> 'internal_note', ''), auth.uid(), auth.uid())
    returning id into v_id;
    if not v.all_tracks then
      insert into public.schedule_block_tracks (block_id, track_id) select v_id, unnest(v.track_ids);
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  v_actions := app.apply_conflict_actions(v_conf, p_conflict_actions,
                                          coalesce(nullif(p ->> 'public_label', ''), p ->> 'reason'));
  perform app.audit('block_create', 'schedule_blocks', v_series::text, null,
                    p || jsonb_build_object('occurrences', cardinality(v_ids), 'conflict_actions', v_actions));
  return jsonb_build_object('series_id', v_series, 'block_ids', to_jsonb(v_ids), 'conflicts', v_actions);
end;
$$;

-- Modification. p_scope = 'occurrence' (horaires, pistes, libellés) ou
-- 'series' (libellés, motif, visibilité, pistes — pas les horaires).
create or replace function public.admin_update_block(
  p_block_id uuid, p jsonb, p_scope text default 'occurrence', p_conflict_actions jsonb default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_block   public.schedule_blocks;
  v_targets uuid[];
  v_before  jsonb;
  v_merged  jsonb;
  v         record;
  v_ranges  tstzrange[];
  v_conf    uuid[];
  v_actions jsonb;
  v_starts  timestamptz;
  v_ends    timestamptz;
  v_tracks  uuid[];
  v_all     boolean;
begin
  perform app.require_staff();
  if p_scope not in ('occurrence', 'series') then
    perform app.fail('KR_SCOPE_INVALID');
  end if;
  select * into v_block from public.schedule_blocks where id = p_block_id for update;
  if v_block.id is null then
    perform app.fail('KR_NOT_FOUND', 'Blocage introuvable.');
  end if;
  v_targets := case when p_scope = 'series'
                    then array(select b.id from public.schedule_blocks b where b.series_id = v_block.series_id and b.ends_at > now())
                    else array[p_block_id] end;
  select jsonb_agg(to_jsonb(b)) into v_before from public.schedule_blocks b where b.id = any (v_targets);

  v_all := coalesce((p ->> 'all_tracks')::boolean, v_block.all_tracks);
  v_tracks := case when p ? 'track_ids'
                   then array(select jsonb_array_elements_text(p -> 'track_ids')::uuid)
                   else array(select bt.track_id from public.schedule_block_tracks bt where bt.block_id = p_block_id) end;
  if not v_all and cardinality(v_tracks) = 0 then
    perform app.fail('KR_BLOCK_INVALID', 'Choisissez au moins une piste (ou tout le site).');
  end if;

  if p_scope = 'occurrence' and (p ? 'block_type' or p ? 'date' or p ? 'starts_at' or p ? 'ends_at') then
    v_merged := jsonb_build_object(
      'block_type', coalesce(p ->> 'block_type', v_block.block_type::text),
      'date', coalesce(p ->> 'date', app.local_date(v_block.starts_at)::text),
      'starts_at', coalesce(p ->> 'starts_at', v_block.starts_at::text),
      'ends_at', coalesce(p ->> 'ends_at', v_block.ends_at::text));
    select o.starts_at, o.ends_at into v_starts, v_ends from app.block_occurrences(v_merged) o limit 1;
  end if;

  v_ranges := array(select tstzrange(coalesce(v_starts, b.starts_at), coalesce(v_ends, b.ends_at), '[)')
                    from public.schedule_blocks b where b.id = any (v_targets));

  perform app.lock_slots_in_ranges(v_ranges, v_tracks, v_all);
  -- Les réservations déjà conservées lors d'une précédente validation restent des conflits
  -- potentiels : l'UI les représente avec leur action.
  v_conf := array(select c.booking_id from app.block_conflicts(v_ranges, v_tracks, v_all) c);
  if cardinality(v_conf) > 0 and p_conflict_actions is null then
    perform app.fail('KR_BLOCK_HAS_CONFLICTS',
      format('%s réservation(s) sur cette plage : choisissez une action.', cardinality(v_conf)),
      cardinality(v_conf)::text);
  end if;

  update public.schedule_blocks b set
    starts_at = coalesce(v_starts, b.starts_at),
    ends_at = coalesce(v_ends, b.ends_at),
    block_type = case when v_starts is not null then coalesce((p ->> 'block_type')::public.block_type, b.block_type) else b.block_type end,
    reason = coalesce((p ->> 'reason')::public.block_reason, b.reason),
    public_label = case when p ? 'public_label' then nullif(trim(p ->> 'public_label'), '') else b.public_label end,
    is_public = coalesce((p ->> 'is_public')::boolean, b.is_public),
    all_tracks = v_all,
    internal_note = coalesce(p ->> 'internal_note', b.internal_note),
    customer_id = case when p ? 'customer_id' then nullif(p ->> 'customer_id', '')::uuid else b.customer_id end,
    updated_by = auth.uid()
  where b.id = any (v_targets);

  delete from public.schedule_block_tracks where block_id = any (v_targets);
  if not v_all then
    insert into public.schedule_block_tracks (block_id, track_id)
    select b, t from unnest(v_targets) b, unnest(v_tracks) t;
  end if;

  v_actions := app.apply_conflict_actions(v_conf, coalesce(p_conflict_actions, '{"default":"keep"}'::jsonb),
                                          coalesce(nullif(p ->> 'public_label', ''), v_block.public_label, v_block.reason::text));
  perform app.audit('block_update', 'schedule_blocks', p_block_id::text, v_before,
                    p || jsonb_build_object('scope', p_scope, 'conflict_actions', v_actions));
  return jsonb_build_object('block_ids', to_jsonb(v_targets), 'conflicts', v_actions);
end;
$$;

-- Suppression : les créneaux se rouvrent immédiatement (la dispo est calculée en direct).
create or replace function public.admin_delete_block(p_block_id uuid, p_scope text default 'occurrence')
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_block  public.schedule_blocks;
  v_before jsonb;
  v_n      integer;
begin
  perform app.require_staff();
  select * into v_block from public.schedule_blocks where id = p_block_id;
  if v_block.id is null then
    perform app.fail('KR_NOT_FOUND', 'Blocage introuvable.');
  end if;
  select jsonb_agg(to_jsonb(b)) into v_before from public.schedule_blocks b
   where (p_scope = 'series' and b.series_id = v_block.series_id and b.ends_at > now())
      or b.id = p_block_id;
  delete from public.schedule_blocks b
   where (p_scope = 'series' and b.series_id = v_block.series_id and b.ends_at > now())
      or b.id = p_block_id;
  get diagnostics v_n = row_count;
  perform app.audit('block_delete', 'schedule_blocks', p_block_id::text, v_before, jsonb_build_object('scope', p_scope));
  return v_n;
end;
$$;

-- Duplication d'une occurrence vers une autre date (mêmes heures locales, mêmes pistes)
create or replace function public.admin_duplicate_block(p_block_id uuid, p_target_date date, p_conflict_actions jsonb default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b     public.schedule_blocks;
  v_shift integer;
  v_p     jsonb;
begin
  perform app.require_staff();
  select * into v_b from public.schedule_blocks where id = p_block_id;
  if v_b.id is null then
    perform app.fail('KR_NOT_FOUND', 'Blocage introuvable.');
  end if;
  v_shift := p_target_date - app.local_date(v_b.starts_at);
  v_p := jsonb_build_object(
    'block_type', 'custom',
    'starts_at', ((v_b.starts_at at time zone app.tz()) + make_interval(days => v_shift)) at time zone app.tz(),
    'ends_at',   ((v_b.ends_at   at time zone app.tz()) + make_interval(days => v_shift)) at time zone app.tz(),
    'all_tracks', v_b.all_tracks,
    'track_ids', (select coalesce(jsonb_agg(bt.track_id), '[]'::jsonb) from public.schedule_block_tracks bt where bt.block_id = v_b.id),
    'reason', v_b.reason, 'public_label', v_b.public_label, 'is_public', v_b.is_public,
    'internal_note', v_b.internal_note, 'customer_id', v_b.customer_id);
  -- Le type d'origine (matin, journée…) est conservé pour l'affichage
  return public.admin_create_block(v_p, p_conflict_actions)
         || jsonb_build_object('source_block_id', v_b.id);
end;
$$;

-- Conversion d'un blocage en événement vendable (trackday à places)
create or replace function public.admin_convert_block_to_event(p_block_id uuid, p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b  public.schedule_blocks;
  v_id uuid;
  v_title text;
begin
  perform app.require_staff();
  select * into v_b from public.schedule_blocks where id = p_block_id for update;
  if v_b.id is null then
    perform app.fail('KR_NOT_FOUND', 'Blocage introuvable.');
  end if;
  if v_b.event_id is not null then
    perform app.fail('KR_ALREADY_EVENT', 'Ce blocage est déjà lié à un événement.');
  end if;
  v_title := coalesce(nullif(p ->> 'title', ''), v_b.public_label, 'Trackday');

  insert into public.events (slug, title, kind, category, description, starts_at, ends_at, capacity, price_cents,
                             requires_own_vehicle, is_published, is_bookable, created_by)
  values (
    coalesce(nullif(p ->> 'slug', ''),
             regexp_replace(app.normalize_name(v_title), '[^a-z0-9]+', '-', 'g') || '-' || to_char(v_b.starts_at at time zone app.tz(), 'YYYY-MM-DD')),
    v_title,
    coalesce((p ->> 'kind')::public.event_kind,
             case v_b.reason when 'trackday' then 'trackday' when 'competition' then 'competition' else 'event' end::public.event_kind),
    coalesce((p ->> 'category')::public.event_category, 'mixed'),
    coalesce(p ->> 'description', ''), v_b.starts_at, v_b.ends_at,
    coalesce((p ->> 'capacity')::integer, 0), (p ->> 'price_cents')::integer,
    coalesce((p ->> 'requires_own_vehicle')::boolean, true),
    coalesce((p ->> 'is_published')::boolean, false), coalesce((p ->> 'is_bookable')::boolean, false), auth.uid())
  returning id into v_id;

  insert into public.event_tracks (event_id, track_id)
  select v_id, t.id from public.tracks t
  where t.is_active and (v_b.all_tracks or exists (select 1 from public.schedule_block_tracks bt where bt.block_id = v_b.id and bt.track_id = t.id));

  update public.schedule_blocks
     set event_id = v_id, is_public = true, public_label = coalesce(public_label, v_title), updated_by = auth.uid()
   where id = v_b.id;

  perform app.audit('block_convert_to_event', 'schedule_blocks', v_b.id::text, to_jsonb(v_b), jsonb_build_object('event_id', v_id) || p);
  return v_id;
end;
$$;

-- =============================================================================
-- Événements (staff)
-- =============================================================================
create or replace function public.admin_upsert_event(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_before jsonb;
  v_taken  integer;
begin
  perform app.require_staff();
  if v_id is null then
    insert into public.events (slug, title, kind, category, description, starts_at, ends_at, capacity, price_cents,
                               vat_rate_bp, requires_own_vehicle, is_published, is_bookable, image_path, created_by)
    values (p ->> 'slug', p ->> 'title', coalesce((p ->> 'kind')::public.event_kind, 'trackday'),
            coalesce((p ->> 'category')::public.event_category, 'mixed'), coalesce(p ->> 'description', ''),
            (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz, coalesce((p ->> 'capacity')::integer, 0),
            (p ->> 'price_cents')::integer, coalesce((p ->> 'vat_rate_bp')::integer, 2000),
            coalesce((p ->> 'requires_own_vehicle')::boolean, true), coalesce((p ->> 'is_published')::boolean, false),
            coalesce((p ->> 'is_bookable')::boolean, false), p ->> 'image_path', auth.uid())
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id for update;
    if v_before is null then perform app.fail('KR_NOT_FOUND'); end if;
    select coalesce(sum(b.participants_count), 0) into v_taken from public.bookings b
     where b.event_id = v_id and app.is_active_status(b.status);
    if (p ->> 'capacity')::integer < v_taken then
      perform app.fail('KR_CAPACITY_BELOW_BOOKED', format('%s places déjà réservées.', v_taken));
    end if;
    update public.events e set
      slug = coalesce(p ->> 'slug', e.slug), title = coalesce(p ->> 'title', e.title),
      kind = coalesce((p ->> 'kind')::public.event_kind, e.kind),
      category = coalesce((p ->> 'category')::public.event_category, e.category),
      description = coalesce(p ->> 'description', e.description),
      starts_at = coalesce((p ->> 'starts_at')::timestamptz, e.starts_at),
      ends_at = coalesce((p ->> 'ends_at')::timestamptz, e.ends_at),
      capacity = coalesce((p ->> 'capacity')::integer, e.capacity),
      price_cents = case when p ? 'price_cents' then (p ->> 'price_cents')::integer else e.price_cents end,
      vat_rate_bp = coalesce((p ->> 'vat_rate_bp')::integer, e.vat_rate_bp),
      requires_own_vehicle = coalesce((p ->> 'requires_own_vehicle')::boolean, e.requires_own_vehicle),
      is_published = coalesce((p ->> 'is_published')::boolean, e.is_published),
      is_bookable = coalesce((p ->> 'is_bookable')::boolean, e.is_bookable),
      image_path = case when p ? 'image_path' then p ->> 'image_path' else e.image_path end
    where e.id = v_id;
  end if;
  if jsonb_typeof(p -> 'track_ids') = 'array' then
    delete from public.event_tracks where event_id = v_id;
    insert into public.event_tracks (event_id, track_id) select v_id, t::uuid from jsonb_array_elements_text(p -> 'track_ids') t;
  end if;
  perform app.audit(case when v_before is null then 'event_create' else 'event_update' end, 'events', v_id::text,
                    v_before, (select to_jsonb(e) from public.events e where e.id = v_id));
  return v_id;
end;
$$;

-- Participants d'un événement (export)
create or replace function public.admin_event_participants(p_event_id uuid)
returns table (booking_reference text, booking_status public.booking_status, customer_name text, customer_email text,
               customer_phone text, first_name text, last_name text, birth_date date, extra jsonb,
               waiver_signed boolean, amount_due_cents integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  return query
  select b.reference, b.status, trim(c.first_name || ' ' || c.last_name), c.email, c.phone,
         p.first_name, p.last_name, p.birth_date, p.extra, p.waiver_signed_at is not null,
         greatest(b.total_cents - b.gift_card_applied_cents - app.booking_paid_cents(b.id), 0)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.booking_participants p on p.booking_id = b.id
  where b.event_id = p_event_id and app.is_active_status(b.status)
  order by p.last_name, p.first_name;
end;
$$;

-- =============================================================================
-- Réservations (staff)
-- =============================================================================

-- Saisie manuelle (téléphone / comptoir). Hors quota en ligne ; capacité totale,
-- blocages, âges et chevauchements toujours contrôlés.
-- p = {product_id, slot_ids, karts, customer{…}, participants[…], source, status,
--      internal_note, gift_card_code, notify_customer}
create or replace function public.admin_create_booking(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_hold     record;
  v_customer uuid;
  v_id       uuid;
  v_json     jsonb;
  v_source   public.booking_source := coalesce((p ->> 'source')::public.booking_source, 'phone');
begin
  perform app.require_staff();
  if v_source = 'online' then
    v_source := 'admin';
  end if;
  v_customer := case when nullif(p ->> 'customer_id', '') is not null
                     then (select id from public.customers where id = (p ->> 'customer_id')::uuid)
                     else app.upsert_customer(coalesce(p -> 'customer', '{}'::jsonb), false) end;
  if v_customer is null then
    perform app.fail('KR_CUSTOMER_NOT_FOUND');
  end if;

  select * into v_hold from app.create_hold(
    (p ->> 'product_id')::uuid,
    array(select jsonb_array_elements_text(p -> 'slot_ids')::uuid),
    (p ->> 'karts')::integer, false);

  v_id := app.create_booking_from_hold(
    v_hold.hold_token, v_customer, coalesce(p -> 'participants', '[]'::jsonb), v_source, false,
    p ->> 'gift_card_code', '', coalesce((p ->> 'status')::public.booking_status, 'confirmed'), false);

  update public.bookings set internal_note = coalesce(p ->> 'internal_note', '') where id = v_id;
  v_json := app.booking_json(v_id);
  if coalesce((p ->> 'notify_customer')::boolean, true) then
    perform app.enqueue_email('booking_confirmation', v_json #>> '{customer,email}', v_json);
  end if;
  perform app.audit('booking_create', 'bookings', v_id::text, null, p - 'participants');
  return v_json;
end;
$$;

-- Déplacement (glisser-déposer du planning) : nouveaux créneaux complets
create or replace function public.admin_move_booking(p_booking_id uuid, p_slot_ids uuid[], p_notify boolean default true)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_json   jsonb;
begin
  perform app.require_staff();
  v_before := app.booking_json(p_booking_id);
  if v_before is null then
    perform app.fail('KR_BOOKING_NOT_FOUND');
  end if;
  if (v_before ->> 'status') not in ('pending', 'confirmed', 'reschedule_required') then
    perform app.fail('KR_BOOKING_NOT_RESCHEDULABLE', 'Cette réservation ne peut plus être déplacée.');
  end if;
  perform app.move_booking(p_booking_id, p_slot_ids, false);
  v_json := app.booking_json(p_booking_id);
  if p_notify then
    perform app.enqueue_email('booking_rescheduled', v_json #>> '{customer,email}', v_json);
  end if;
  perform app.audit('booking_move', 'bookings', p_booking_id::text, v_before -> 'sessions', v_json -> 'sessions');
  return v_json;
end;
$$;

create or replace function public.admin_cancel_booking(
  p_booking_id uuid, p_outcome text, p_reason text, p_notify boolean default true)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  perform app.require_staff();
  v_res := app.apply_cancellation(p_booking_id, p_outcome, p_reason, 'booking_cancelled_by_circuit', p_notify);
  perform app.audit('booking_cancel', 'bookings', p_booking_id::text, null, v_res || jsonb_build_object('reason', p_reason));
  return v_res;
end;
$$;

create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status public.booking_status)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_old public.booking_status;
begin
  perform app.require_staff();
  if p_status in ('cancelled', 'reschedule_required') then
    perform app.fail('KR_STATUS_INVALID', 'Utilisez l''annulation ou le déplacement.');
  end if;
  select status into v_old from public.bookings where id = p_booking_id for update;
  if v_old is null then perform app.fail('KR_BOOKING_NOT_FOUND'); end if;
  if v_old = 'cancelled' then
    perform app.fail('KR_STATUS_INVALID', 'Réservation annulée.');
  end if;
  update public.bookings set status = p_status,
         checked_in_at = case when p_status = 'checked_in' then coalesce(checked_in_at, now()) else checked_in_at end
   where id = p_booking_id;
  perform app.audit('booking_status', 'bookings', p_booking_id::text,
                    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_update_booking_note(p_booking_id uuid, p_note text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  update public.bookings set internal_note = coalesce(p_note, '') where id = p_booking_id;
  perform app.audit('booking_note', 'bookings', p_booking_id::text, null, jsonb_build_object('note', p_note));
end;
$$;

-- Recherche pour check-in : qr_token (scan) ou référence KR-XXXXXX
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
  return app.booking_json(v_id, true)
         || jsonb_build_object('is_today', (select booking_date = app.local_date(now()) from public.bookings where id = v_id));
end;
$$;

-- Check-in : tous les participants (p_participant_ids null) ou une sélection
create or replace function public.admin_check_in(p_booking_id uuid, p_participant_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_status public.booking_status;
begin
  perform app.require_staff();
  select status into v_status from public.bookings where id = p_booking_id for update;
  if v_status is null then perform app.fail('KR_BOOKING_NOT_FOUND'); end if;
  if v_status not in ('pending', 'confirmed', 'checked_in') then
    perform app.fail('KR_STATUS_INVALID', 'Réservation non valide pour un check-in (' || v_status || ').');
  end if;
  update public.booking_participants
     set checked_in_at = coalesce(checked_in_at, now())
   where booking_id = p_booking_id and (p_participant_ids is null or id = any (p_participant_ids));
  update public.bookings set status = 'checked_in', checked_in_at = coalesce(checked_in_at, now()) where id = p_booking_id;
  perform app.audit('booking_check_in', 'bookings', p_booking_id::text, null, jsonb_build_object('participants', p_participant_ids));
  return app.booking_json(p_booking_id, true);
end;
$$;

-- Signature de décharge au comptoir
create or replace function public.admin_sign_waiver(p_participant_id uuid, p_signed_by text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if nullif(trim(coalesce(p_signed_by, '')), '') is null then
    perform app.fail('KR_WAIVER_SIGNER_REQUIRED', 'Nom du signataire obligatoire.');
  end if;
  update public.booking_participants
     set waiver_signed_at = now(), waiver_signed_by = trim(p_signed_by),
         waiver_version = (select version from public.waiver_versions where is_current)
   where id = p_participant_id;
  perform app.audit('waiver_sign', 'booking_participants', p_participant_id::text, null, jsonb_build_object('signed_by', p_signed_by));
end;
$$;

-- Ajout / correction d'un participant (réservation téléphone complétée au comptoir)
create or replace function public.admin_upsert_participant(p_booking_id uuid, p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_birth date := (p ->> 'birth_date')::date;
  v_first text := trim(coalesce(p ->> 'first_name', ''));
  v_last  text := trim(coalesce(p ->> 'last_name', ''));
begin
  perform app.require_staff();
  if v_first = '' or v_last = '' or v_birth is null then
    perform app.fail('KR_PARTICIPANT_NAME', 'Nom, prénom et date de naissance obligatoires.');
  end if;
  if v_id is null then
    insert into public.booking_participants (booking_id, role, first_name, last_name, birth_date, height_cm,
                                             height_certified, pilot_key, extra)
    values (p_booking_id, coalesce((p ->> 'role')::public.participant_role, 'driver'), v_first, v_last, v_birth,
            (p ->> 'height_cm')::integer, coalesce((p ->> 'height_certified')::boolean, false),
            app.pilot_key(v_first, v_last, v_birth), coalesce(p -> 'extra', '{}'::jsonb))
    returning id into v_id;
  else
    update public.booking_participants set
      role = coalesce((p ->> 'role')::public.participant_role, role), first_name = v_first, last_name = v_last,
      birth_date = v_birth, height_cm = (p ->> 'height_cm')::integer,
      height_certified = coalesce((p ->> 'height_certified')::boolean, height_certified),
      pilot_key = app.pilot_key(v_first, v_last, v_birth), extra = coalesce(p -> 'extra', extra)
    where id = v_id and booking_id = p_booking_id;
  end if;
  update public.bookings b set participants_count = greatest(b.karts, (select count(*) from public.booking_participants x where x.booking_id = b.id))
   where b.id = p_booking_id;
  perform app.assert_no_pilot_overlap(p_booking_id);
  perform app.audit('participant_upsert', 'booking_participants', v_id::text, null, p);
  return v_id;
end;
$$;

-- Encaissement / remboursement (remboursement : owner uniquement)
-- p = {booking_id | request_id | gift_card_id, amount_cents, method, kind, note}
create or replace function public.admin_record_payment(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_kind    public.payment_kind := coalesce((p ->> 'kind')::public.payment_kind, 'payment');
  v_amount  integer := (p ->> 'amount_cents')::integer;
  v_rate    integer;
  v_booking uuid := nullif(p ->> 'booking_id', '')::uuid;
  v_request uuid := nullif(p ->> 'request_id', '')::uuid;
  v_card    uuid := nullif(p ->> 'gift_card_id', '')::uuid;
  v_id      uuid;
begin
  perform app.require_staff();
  if v_kind = 'refund' then
    perform app.require_owner();
  end if;
  if v_amount is null or v_amount <= 0 then
    perform app.fail('KR_AMOUNT_INVALID', 'Montant invalide.');
  end if;

  if v_booking is not null then
    select vat_rate_bp into v_rate from public.bookings where id = v_booking;
  elsif v_request is not null then
    v_rate := 2000;
  elsif v_card is not null then
    -- Bon polyvalent (montant) : TVA à l'utilisation ; bon à usage unique (produit) : TVA à l'émission
    select case when kind = 'product' then 2000 else 0 end into v_rate from public.gift_cards where id = v_card;
  end if;
  if v_rate is null then
    perform app.fail('KR_NOT_FOUND', 'Réservation, demande ou bon introuvable.');
  end if;

  insert into public.payments (booking_id, request_id, gift_card_id, kind, method, amount_cents, vat_rate_bp, vat_cents,
                               note, recorded_by)
  values (v_booking, v_request, v_card, v_kind, (p ->> 'method')::public.payment_method, v_amount, v_rate,
          round(v_amount * v_rate / (10000.0 + v_rate))::integer, coalesce(p ->> 'note', ''), auth.uid())
  returning id into v_id;

  if v_booking is not null and v_kind = 'refund' then
    update public.bookings set cancellation_outcome = 'full_refund'
     where id = v_booking and cancellation_outcome = 'refund_due' and app.booking_paid_cents(id) <= 0;
  end if;

  perform app.audit('payment_' || v_kind, 'payments', v_id::text, null, p);
  return v_id;
end;
$$;

-- =============================================================================
-- Demandes (pipeline : new → quoted → confirmed → paid)
-- p = {status, quote_amount_cents, deposit_cents, internal_note, assigned_to,
--      product_id, notify_customer, block:{…admin_create_block…}, conflict_actions}
-- =============================================================================
create or replace function public.admin_update_request(p_request_id uuid, p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before public.requests;
  v_after  public.requests;
  v_block  jsonb;
begin
  perform app.require_staff();
  select * into v_before from public.requests where id = p_request_id for update;
  if v_before.id is null then perform app.fail('KR_NOT_FOUND', 'Demande introuvable.'); end if;

  update public.requests r set
    status = coalesce((p ->> 'status')::public.request_status, r.status),
    status_changed_at = case when (p ->> 'status') is not null and (p ->> 'status') <> r.status::text then now() else r.status_changed_at end,
    quote_amount_cents = case when p ? 'quote_amount_cents' then (p ->> 'quote_amount_cents')::integer else r.quote_amount_cents end,
    deposit_cents = case when p ? 'deposit_cents' then (p ->> 'deposit_cents')::integer else r.deposit_cents end,
    internal_note = coalesce(p ->> 'internal_note', r.internal_note),
    assigned_to = case when p ? 'assigned_to' then nullif(p ->> 'assigned_to', '')::uuid else r.assigned_to end,
    product_id = case when p ? 'product_id' then nullif(p ->> 'product_id', '')::uuid else r.product_id end,
    preferred_date = case when p ? 'preferred_date' then (p ->> 'preferred_date')::date else r.preferred_date end,
    participants_count = case when p ? 'participants_count' then (p ->> 'participants_count')::integer else r.participants_count end
  where r.id = p_request_id
  returning * into v_after;

  -- Blocage de planning associé (privatisation de l'anniversaire, du team building…)
  if jsonb_typeof(p -> 'block') = 'object' then
    v_block := public.admin_create_block(
      (p -> 'block') || jsonb_build_object('request_id', p_request_id, 'customer_id', v_after.customer_id),
      p -> 'conflict_actions');
    update public.requests set schedule_block_id = ((v_block -> 'block_ids') ->> 0)::uuid where id = p_request_id;
  end if;

  if coalesce((p ->> 'notify_customer')::boolean, true) and v_after.status <> v_before.status
     and v_after.status in ('quoted', 'confirmed', 'cancelled') then
    perform app.enqueue_email('request_' || v_after.status, v_after.contact_email,
      jsonb_build_object('reference', v_after.reference, 'type', v_after.type, 'contact_name', v_after.contact_name,
                         'quote_amount_cents', v_after.quote_amount_cents, 'deposit_cents', v_after.deposit_cents,
                         'preferred_date', v_after.preferred_date, 'participants_count', v_after.participants_count));
  end if;

  perform app.audit('request_update', 'requests', p_request_id::text, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) || jsonb_build_object('block', v_block);
end;
$$;

-- =============================================================================
-- Bons cadeaux
-- =============================================================================
-- p = {kind, amount_cents | product_id, recipient_name, recipient_email, message,
--      purchaser{…} | purchaser_customer_id, payment:{method} (null = en attente), send_email}
create or replace function public.admin_issue_gift_card(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_kind      public.gift_card_kind := coalesce((p ->> 'kind')::public.gift_card_kind, 'amount');
  v_product   public.products;
  v_amount    integer := (p ->> 'amount_cents')::integer;
  v_paid      boolean := jsonb_typeof(p -> 'payment') = 'object';
  v_purchaser uuid;
  v_card      public.gift_cards;
begin
  perform app.require_staff();
  if v_kind = 'product' then
    select * into v_product from public.products where id = (p ->> 'product_id')::uuid;
    if v_product.id is null or v_product.price_cents is null then
      perform app.fail('KR_PRODUCT_NOT_FOUND', 'Produit sans prix : utilisez un bon « montant ».');
    end if;
    v_amount := coalesce(v_amount, v_product.price_cents);
  end if;
  v_purchaser := coalesce(nullif(p ->> 'purchaser_customer_id', '')::uuid,
                          case when jsonb_typeof(p -> 'purchaser') = 'object' then app.upsert_customer(p -> 'purchaser', false) end);

  v_card := app.issue_gift_card(v_kind, 'manual', v_amount, v_product.id, v_paid, v_purchaser,
                                p ->> 'recipient_name', p ->> 'recipient_email', p ->> 'message');
  if v_paid then
    perform public.admin_record_payment(jsonb_build_object('gift_card_id', v_card.id, 'amount_cents', v_amount,
                                                           'method', p #>> '{payment,method}', 'note', 'Vente bon cadeau'));
    if coalesce((p ->> 'send_email')::boolean, true) then
      perform app.enqueue_email('gift_card_issued',
        coalesce(v_card.recipient_email, (select email from public.customers where id = v_purchaser)),
        jsonb_build_object('code', v_card.code, 'amount_cents', v_card.initial_amount_cents, 'kind', v_card.kind,
                           'product', v_product.name, 'recipient_name', v_card.recipient_name,
                           'message', v_card.message, 'expires_at', v_card.expires_at));
    end if;
  end if;
  perform app.audit('gift_card_issue', 'gift_cards', v_card.id::text, null, to_jsonb(v_card));
  return to_jsonb(v_card);
end;
$$;

-- Activation d'un bon en attente après encaissement sur place
create or replace function public.admin_activate_gift_card(p_gift_card_id uuid, p_method public.payment_method)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  perform app.require_staff();
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.id is null or v_card.status <> 'pending_payment' then
    perform app.fail('KR_GIFT_CARD_INVALID', 'Bon introuvable ou déjà actif.');
  end if;
  update public.gift_cards
     set status = 'active', issued_at = now(),
         expires_at = now() + make_interval(months => app.setting_int('gift_card_validity_months', 12))
   where id = p_gift_card_id
  returning * into v_card;
  insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, created_by)
  values (v_card.id, 'issue', v_card.initial_amount_cents, v_card.balance_cents, auth.uid());
  perform public.admin_record_payment(jsonb_build_object('gift_card_id', v_card.id, 'amount_cents', v_card.initial_amount_cents,
                                                         'method', p_method, 'note', 'Vente bon cadeau'));
  perform app.enqueue_email('gift_card_issued',
    coalesce(v_card.recipient_email, (select email from public.customers where id = v_card.purchaser_customer_id)),
    jsonb_build_object('code', v_card.code, 'amount_cents', v_card.initial_amount_cents, 'kind', v_card.kind,
                       'recipient_name', v_card.recipient_name, 'message', v_card.message, 'expires_at', v_card.expires_at));
  perform app.audit('gift_card_activate', 'gift_cards', v_card.id::text, null, jsonb_build_object('method', p_method));
  return to_jsonb(v_card);
end;
$$;

create or replace function public.admin_set_gift_card_status(p_gift_card_id uuid, p_status public.gift_card_status)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_old public.gift_card_status;
begin
  perform app.require_owner();
  if p_status not in ('active', 'disabled') then
    perform app.fail('KR_STATUS_INVALID', 'Statut autorisé : actif ou désactivé.');
  end if;
  select status into v_old from public.gift_cards where id = p_gift_card_id for update;
  if v_old is null or v_old = 'pending_payment' then
    perform app.fail('KR_GIFT_CARD_INVALID');
  end if;
  update public.gift_cards set status = p_status where id = p_gift_card_id;
  perform app.audit('gift_card_status', 'gift_cards', p_gift_card_id::text,
                    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_adjust_gift_card(p_gift_card_id uuid, p_amount_cents integer, p_note text)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
  v_new  integer;
begin
  perform app.require_owner();
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.id is null then perform app.fail('KR_NOT_FOUND'); end if;
  v_new := v_card.balance_cents + p_amount_cents;
  if v_new < 0 or v_new > v_card.initial_amount_cents then
    perform app.fail('KR_AMOUNT_INVALID', 'Le solde doit rester entre 0 et le montant initial.');
  end if;
  update public.gift_cards
     set balance_cents = v_new,
         status = case when v_new = 0 then 'exhausted' when status = 'exhausted' then 'active' else status end::public.gift_card_status
   where id = p_gift_card_id;
  insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, note, created_by)
  values (p_gift_card_id, 'adjust', p_amount_cents, v_new, coalesce(p_note, ''), auth.uid());
  perform app.audit('gift_card_adjust', 'gift_cards', p_gift_card_id::text,
                    jsonb_build_object('balance', v_card.balance_cents), jsonb_build_object('balance', v_new, 'note', p_note));
  return v_new;
end;
$$;

-- =============================================================================
-- Clients
-- =============================================================================
create or replace function public.admin_update_customer(p_customer_id uuid, p jsonb)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform app.require_staff();
  select to_jsonb(c) into v_before from public.customers c where c.id = p_customer_id for update;
  if v_before is null then perform app.fail('KR_NOT_FOUND'); end if;
  update public.customers c set
    first_name = coalesce(p ->> 'first_name', c.first_name),
    last_name = coalesce(p ->> 'last_name', c.last_name),
    email = case when p ? 'email' then nullif(p ->> 'email', '') else c.email end,
    phone = coalesce(p ->> 'phone', c.phone),
    company = coalesce(p ->> 'company', c.company),
    birth_date = case when p ? 'birth_date' then (p ->> 'birth_date')::date else c.birth_date end,
    internal_notes = coalesce(p ->> 'internal_notes', c.internal_notes),
    marketing_opt_in = coalesce((p ->> 'marketing_opt_in')::boolean, c.marketing_opt_in)
  where c.id = p_customer_id;
  perform app.audit('customer_update', 'customers', p_customer_id::text, v_before,
                    (select to_jsonb(c) from public.customers c where c.id = p_customer_id));
end;
$$;

-- Validation chrono (condition d'accès Pack Rotax). La fiche doit avoir nom + date de naissance.
create or replace function public.admin_set_chrono_validation(p_customer_id uuid, p_validated boolean)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_validated and not exists (select 1 from public.customers where id = p_customer_id and pilot_key is not null) then
    perform app.fail('KR_PILOT_INCOMPLETE', 'Renseignez le nom et la date de naissance du pilote avant validation.');
  end if;
  update public.customers
     set chrono_validated = p_validated,
         chrono_validated_at = case when p_validated then now() end,
         chrono_validated_by = case when p_validated then auth.uid() end
   where id = p_customer_id;
  perform app.audit('chrono_validation', 'customers', p_customer_id::text, null, jsonb_build_object('validated', p_validated));
end;
$$;

-- RGPD : export complet des données d'un client
create or replace function public.admin_export_customer(p_customer_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.audit('customer_export', 'customers', p_customer_id::text, null, null);
  return jsonb_build_object(
    'customer', (select to_jsonb(c) - 'pilot_key' from public.customers c where c.id = p_customer_id),
    'bookings', (select coalesce(jsonb_agg(app.booking_json(b.id, true)), '[]'::jsonb) from public.bookings b where b.customer_id = p_customer_id),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.requests r where r.customer_id = p_customer_id),
    'gift_cards', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.gift_cards g where g.purchaser_customer_id = p_customer_id),
    'lap_records', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.lap_records l where l.customer_id = p_customer_id),
    'exported_at', now());
end;
$$;

-- RGPD : anonymisation (les montants restent pour les obligations comptables)
create or replace function public.admin_anonymize_customer(p_customer_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_owner();
  if exists (select 1 from public.bookings where customer_id = p_customer_id
             and status in ('pending', 'confirmed', 'reschedule_required') and starts_at > now()) then
    perform app.fail('KR_CUSTOMER_HAS_FUTURE_BOOKINGS', 'Annulez d''abord les réservations à venir.');
  end if;
  update public.customers
     set email = null, first_name = 'Anonyme', last_name = '', phone = '', company = '', birth_date = null,
         internal_notes = '', marketing_opt_in = false, chrono_validated = false, auth_user_id = null,
         anonymized_at = now()
   where id = p_customer_id;
  update public.booking_participants bp
     set first_name = 'Anonyme', last_name = '', height_cm = null, extra = '{}'::jsonb, waiver_signed_by = null,
         birth_date = date_trunc('year', bp.birth_date)::date,
         pilot_key = md5(gen_random_uuid()::text)
   where bp.booking_id in (select id from public.bookings where customer_id = p_customer_id);
  update public.bookings set customer_note = '', internal_note = '' where customer_id = p_customer_id;
  update public.requests
     set contact_name = 'Anonyme', contact_email = 'anonyme@invalid.local', contact_phone = '', company = '',
         message = '', details = '{}'::jsonb
   where customer_id = p_customer_id;
  update public.gift_cards set recipient_name = '', recipient_email = null, message = '' where purchaser_customer_id = p_customer_id;
  update public.lap_records set customer_id = null, driver_name = 'Anonyme' where customer_id = p_customer_id;
  delete from public.email_outbox where payload::text like '%' || p_customer_id::text || '%';
  perform app.audit('customer_anonymize', 'customers', p_customer_id::text, null, null);
end;
$$;

-- =============================================================================
-- Chronos, contenu, avis (staff)
-- =============================================================================
create or replace function public.admin_upsert_lap_record(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require_staff();
  if v_id is null then
    insert into public.lap_records (track_id, vehicle_type_id, category_label, driver_name, customer_id, lap_time_ms,
                                    recorded_on, is_published, created_by)
    values ((p ->> 'track_id')::uuid, nullif(p ->> 'vehicle_type_id', '')::uuid, p ->> 'category_label', p ->> 'driver_name',
            nullif(p ->> 'customer_id', '')::uuid, (p ->> 'lap_time_ms')::integer,
            coalesce((p ->> 'recorded_on')::date, app.local_date(now())), coalesce((p ->> 'is_published')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.lap_records l set
      track_id = coalesce((p ->> 'track_id')::uuid, l.track_id),
      vehicle_type_id = case when p ? 'vehicle_type_id' then nullif(p ->> 'vehicle_type_id', '')::uuid else l.vehicle_type_id end,
      category_label = coalesce(p ->> 'category_label', l.category_label),
      driver_name = coalesce(p ->> 'driver_name', l.driver_name),
      customer_id = case when p ? 'customer_id' then nullif(p ->> 'customer_id', '')::uuid else l.customer_id end,
      lap_time_ms = coalesce((p ->> 'lap_time_ms')::integer, l.lap_time_ms),
      recorded_on = coalesce((p ->> 'recorded_on')::date, l.recorded_on),
      is_published = coalesce((p ->> 'is_published')::boolean, l.is_published)
    where l.id = v_id;
  end if;
  perform app.audit('lap_record_upsert', 'lap_records', v_id::text, null, p);
  return v_id;
end;
$$;

-- Import en masse : p = [{…}, …]
create or replace function public.admin_import_lap_records(p jsonb)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e jsonb;
  n integer := 0;
begin
  perform app.require_staff();
  for e in select * from jsonb_array_elements(p) loop
    perform public.admin_upsert_lap_record(e - 'id');
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.admin_delete_lap_record(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  perform app.require_staff();
  delete from public.lap_records l where l.id = p_id returning to_jsonb(l) into v_before;
  perform app.audit('lap_record_delete', 'lap_records', p_id::text, v_before, null);
end;
$$;

create or replace function public.admin_upsert_site_content(p_key text, p jsonb)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  perform app.require_staff();
  select to_jsonb(s) into v_before from public.site_content s where s.key = p_key;
  insert into public.site_content (key, title, body, data, is_published, updated_by, updated_at)
  values (p_key, coalesce(p ->> 'title', ''), coalesce(p ->> 'body', ''), coalesce(p -> 'data', '{}'::jsonb),
          coalesce((p ->> 'is_published')::boolean, true), auth.uid(), now())
  on conflict (key) do update set
    title = coalesce(p ->> 'title', public.site_content.title),
    body = coalesce(p ->> 'body', public.site_content.body),
    data = coalesce(p -> 'data', public.site_content.data),
    is_published = coalesce((p ->> 'is_published')::boolean, public.site_content.is_published),
    updated_by = auth.uid(), updated_at = now();
  perform app.audit('content_upsert', 'site_content', p_key, v_before, p);
end;
$$;

create or replace function public.admin_upsert_review(p jsonb)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require_staff();
  if v_id is null then
    insert into public.reviews (author_name, rating, body, source, review_date, is_published, sort_order)
    values (p ->> 'author_name', (p ->> 'rating')::smallint, p ->> 'body', coalesce(p ->> 'source', 'google'),
            (p ->> 'review_date')::date, coalesce((p ->> 'is_published')::boolean, false), coalesce((p ->> 'sort_order')::integer, 0))
    returning id into v_id;
  else
    update public.reviews r set
      author_name = coalesce(p ->> 'author_name', r.author_name), rating = coalesce((p ->> 'rating')::smallint, r.rating),
      body = coalesce(p ->> 'body', r.body), source = coalesce(p ->> 'source', r.source),
      review_date = case when p ? 'review_date' then (p ->> 'review_date')::date else r.review_date end,
      is_published = coalesce((p ->> 'is_published')::boolean, r.is_published),
      sort_order = coalesce((p ->> 'sort_order')::integer, r.sort_order)
    where r.id = v_id;
  end if;
  perform app.audit('review_upsert', 'reviews', v_id::text, null, p);
  return v_id;
end;
$$;

create or replace function public.admin_delete_review(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  delete from public.reviews where id = p_id;
  perform app.audit('review_delete', 'reviews', p_id::text, null, null);
end;
$$;

-- =============================================================================
-- Tableau de bord, planning, exports
-- =============================================================================
create or replace function public.admin_dashboard(p_day date default null)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_day   date := coalesce(p_day, app.local_date(now()));
  v_from  timestamptz := app.local_ts(v_day, '00:00');
  v_to    timestamptz := app.local_ts(v_day + 1, '00:00');
  v_res   jsonb;
  v_rev   jsonb;
begin
  perform app.require_staff();

  v_res := jsonb_build_object(
    'day', v_day,
    'bookings_count', (select count(*) from public.bookings b where b.booking_date = v_day and app.is_active_status(b.status)),
    'participants_count', (select coalesce(sum(b.participants_count), 0) from public.bookings b
                            where b.booking_date = v_day and app.is_active_status(b.status)),
    'checked_in_count', (select count(*) from public.bookings b where b.booking_date = v_day and b.status in ('checked_in', 'completed')),
    'fill_rate', (
      select case when sum(sc.capacity) > 0 then round(100.0 * coalesce(sum(u.karts), 0) / sum(sc.capacity), 1) else 0 end
      from public.slots sl
      join public.slot_capacities sc on sc.slot_id = sl.id
      left join lateral (
        select sum(bs.karts) as karts from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
        where bs.slot_id = sl.id and bs.vehicle_type_id = sc.vehicle_type_id and app.is_active_status(b.status)) u on true
      where sl.starts_at >= v_from and sl.starts_at < v_to and sl.is_active),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slot_id', sl.id, 'track', t.short_name, 'starts_at', sl.starts_at,
               'blocked', app.is_blocked(sl.track_id, sl.starts_at, sl.ends_at),
               'capacity', (select coalesce(sum(sc.capacity), 0) from public.slot_capacities sc where sc.slot_id = sl.id),
               'booked', (select coalesce(sum(bs.karts), 0) from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
                          where bs.slot_id = sl.id and app.is_active_status(b.status)),
               'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status,
                                   'karts', bs.karts, 'customer', trim(c.first_name || ' ' || c.last_name))), '[]'::jsonb)
                            from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
                            join public.customers c on c.id = b.customer_id
                            where bs.slot_id = sl.id and app.is_active_status(b.status)))
             order by sl.starts_at, t.sort_order)
      from public.slots sl join public.tracks t on t.id = sl.track_id
      where sl.starts_at >= v_from and sl.starts_at < v_to
        and exists (select 1 from public.booking_sessions bs join public.bookings b on b.id = bs.booking_id
                    where bs.slot_id = sl.id and app.is_active_status(b.status))), '[]'::jsonb),
    'pending_requests', (select count(*) from public.requests where status = 'new'),
    'reschedule_required', (select count(*) from public.bookings where status = 'reschedule_required'),
    'refunds_due', (select count(*) from public.bookings where cancellation_outcome = 'refund_due'),
    'upcoming_blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'reason', b.reason,
                                          'public_label', b.public_label, 'all_tracks', b.all_tracks) order by b.starts_at)
      from (select * from public.schedule_blocks where ends_at > now() and starts_at < now() + interval '14 days'
            order by starts_at limit 20) b), '[]'::jsonb),
    'upcoming_events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'capacity', e.capacity) order by e.starts_at)
      from (select * from public.events where starts_at > now() and starts_at < now() + interval '30 days' order by starts_at limit 10) e), '[]'::jsonb));

  if app.is_owner() then
    -- CA encaissé (hors ventes de bons, qui sont des produits constatés d'avance) + bons consommés
    select jsonb_build_object(
      'day',   app.revenue_cents(v_from, v_to),
      'week',  app.revenue_cents(app.local_ts(v_day - (extract(isodow from v_day)::integer - 1), '00:00'), v_to),
      'month', app.revenue_cents(app.local_ts(date_trunc('month', v_day)::date, '00:00'), v_to))
    into v_rev;
    v_res := v_res || jsonb_build_object('revenue', v_rev);
  end if;
  return v_res;
end;
$$;

-- CA TTC d'une période = encaissements nets (hors vente de bons) + consommation de bons
create or replace function app.revenue_cents(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'collected_cents', coalesce((select sum(case when p.kind = 'payment' then p.amount_cents else -p.amount_cents end)
                                 from public.payments p
                                 where p.paid_at >= p_from and p.paid_at < p_to and p.gift_card_id is null), 0),
    'gift_cards_redeemed_cents', coalesce((select -sum(t.amount_cents) from public.gift_card_transactions t
                                           where t.created_at >= p_from and t.created_at < p_to and t.kind in ('redeem', 'refund')), 0),
    'gift_cards_sold_cents', coalesce((select sum(case when p.kind = 'payment' then p.amount_cents else -p.amount_cents end)
                                       from public.payments p
                                       where p.paid_at >= p_from and p.paid_at < p_to and p.gift_card_id is not null), 0),
    'booked_value_cents', coalesce((select sum(b.total_cents) from public.bookings b
                                    where b.starts_at >= p_from and b.starts_at < p_to and app.is_active_status(b.status)), 0))
$$;

-- Planning : créneaux, capacités, occupation, réservations et blocages (31 jours max)
create or replace function public.admin_planning(p_from date, p_to date, p_track_ids uuid[] default null)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_from timestamptz := app.local_ts(p_from, '00:00');
  v_to   timestamptz := app.local_ts(p_to + 1, '00:00');
begin
  perform app.require_staff();
  if p_to < p_from or p_to - p_from > 31 then
    perform app.fail('KR_RANGE_INVALID', 'Période de 31 jours maximum.');
  end if;
  return jsonb_build_object(
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sl.id, 'track_id', sl.track_id, 'starts_at', sl.starts_at, 'ends_at', sl.ends_at, 'is_active', sl.is_active,
               'capacities', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'vehicle_type_id', sc.vehicle_type_id, 'capacity', sc.capacity,
                                  'online_capacity', sc.online_capacity, 'is_override', sc.is_override,
                                  'booked', (select coalesce(sum(bs.karts), 0) from public.booking_sessions bs
                                             join public.bookings b on b.id = bs.booking_id
                                             where bs.slot_id = sl.id and bs.vehicle_type_id = sc.vehicle_type_id
                                               and app.is_active_status(b.status)),
                                  'held', (select coalesce(sum(h.karts), 0) from public.booking_holds h
                                           where h.slot_id = sl.id and h.vehicle_type_id = sc.vehicle_type_id and h.expires_at > now()))),
                                '[]'::jsonb)
                              from public.slot_capacities sc where sc.slot_id = sl.id))
             order by sl.starts_at)
      from public.slots sl
      where sl.starts_at >= v_from and sl.starts_at < v_to
        and (p_track_ids is null or sl.track_id = any (p_track_ids))), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'reference', b.reference, 'status', b.status, 'source', b.source, 'karts', b.karts,
               'participants_count', b.participants_count, 'product', pr.name, 'vehicle_type_id', pr.vehicle_type_id,
               'customer', trim(c.first_name || ' ' || c.last_name), 'phone', c.phone,
               'sessions', (select jsonb_agg(jsonb_build_object('session_id', bs.id, 'slot_id', bs.slot_id, 'seq', bs.seq) order by bs.seq)
                            from public.booking_sessions bs where bs.booking_id = b.id)))
      from public.bookings b
      join public.customers c on c.id = b.customer_id
      left join public.products pr on pr.id = b.product_id
      where app.is_active_status(b.status)
        and exists (select 1 from public.booking_sessions bs join public.slots sl on sl.id = bs.slot_id
                    where bs.booking_id = b.id and sl.starts_at >= v_from and sl.starts_at < v_to
                      and (p_track_ids is null or sl.track_id = any (p_track_ids)))), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'series_id', b.series_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'block_type', b.block_type,
               'reason', b.reason, 'public_label', b.public_label, 'is_public', b.is_public, 'all_tracks', b.all_tracks,
               'recurrence_rule', b.recurrence_rule, 'event_id', b.event_id, 'request_id', b.request_id,
               'customer_id', b.customer_id, 'internal_note', b.internal_note,
               'track_ids', (select coalesce(jsonb_agg(bt.track_id), '[]'::jsonb) from public.schedule_block_tracks bt where bt.block_id = b.id))
             order by b.starts_at)
      from public.schedule_blocks b
      where b.starts_at < v_to and b.ends_at > v_from), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at) from public.events e
      where e.starts_at < v_to and e.ends_at > v_from), '[]'::jsonb));
end;
$$;

-- Export comptable : une ligne par encaissement / remboursement / consommation de bon
create or replace function public.admin_sales_export(p_from date, p_to date)
returns table (
  occurred_at     timestamptz,
  line_type       text,     -- sale | refund | gift_card_sale | gift_card_refund | gift_card_redemption
  reference       text,
  label           text,
  customer        text,
  payment_method  text,
  amount_ttc_cents integer,
  vat_rate_bp     integer,
  vat_cents       integer,
  amount_ht_cents integer,
  is_deferred     boolean,  -- produit constaté d'avance (vente de bon polyvalent)
  stripe_payment_intent text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_from timestamptz := app.local_ts(p_from, '00:00');
  v_to   timestamptz := app.local_ts(p_to + 1, '00:00');
begin
  perform app.require_owner();
  if p_to < p_from or p_to - p_from > 400 then
    perform app.fail('KR_RANGE_INVALID');
  end if;
  perform app.audit('sales_export', 'payments', null, null, jsonb_build_object('from', p_from, 'to', p_to));

  return query
  with pay as (
    select p.paid_at,
           case when p.gift_card_id is not null then (case when p.kind = 'payment' then 'gift_card_sale' else 'gift_card_refund' end)
                else (case when p.kind = 'payment' then 'sale' else 'refund' end) end as line_type,
           coalesce(b.reference, r.reference, g.code) as reference,
           coalesce(pr.name, ev.title, 'Demande ' || r.type::text, 'Bon cadeau') as label,
           trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as customer,
           p.method::text as method,
           (case when p.kind = 'payment' then 1 else -1 end) * p.amount_cents as ttc,
           p.vat_rate_bp,
           (case when p.kind = 'payment' then 1 else -1 end) * p.vat_cents as vat,
           (p.gift_card_id is not null and g.kind = 'amount') as deferred,
           p.stripe_payment_intent
    from public.payments p
    left join public.bookings b  on b.id = p.booking_id
    left join public.requests r  on r.id = p.request_id
    left join public.gift_cards g on g.id = p.gift_card_id
    left join public.products pr on pr.id = b.product_id
    left join public.events ev   on ev.id = b.event_id
    left join public.customers c on c.id = coalesce(b.customer_id, r.customer_id, g.purchaser_customer_id)
    where p.paid_at >= v_from and p.paid_at < v_to
  ),
  redemptions as (
    -- Consommation de bons polyvalents : constatation du CA et de la TVA
    select t.created_at as paid_at,
           'gift_card_redemption'::text as line_type,
           b.reference,
           coalesce(pr.name, 'Réservation') || ' (bon ' || g.code || ')' as label,
           trim(c.first_name || ' ' || c.last_name) as customer,
           'gift_card'::text as method,
           -t.amount_cents as ttc,
           b.vat_rate_bp,
           round(-t.amount_cents * b.vat_rate_bp / (10000.0 + b.vat_rate_bp))::integer as vat,
           false as deferred,
           null::text as stripe_payment_intent
    from public.gift_card_transactions t
    join public.gift_cards g on g.id = t.gift_card_id and g.kind = 'amount'
    join public.bookings b on b.id = t.booking_id
    join public.customers c on c.id = b.customer_id
    left join public.products pr on pr.id = b.product_id
    where t.kind in ('redeem', 'refund') and t.created_at >= v_from and t.created_at < v_to
  ),
  lines as (
    select * from pay
    union all
    select * from redemptions
  )
  select l.paid_at, l.line_type, l.reference, l.label, l.customer, l.method,
         l.ttc::integer, l.vat_rate_bp, l.vat::integer, (l.ttc - l.vat)::integer, l.deferred, l.stripe_payment_intent
  from lines l
  order by 1;
end;
$$;

-- Synthèse des bons cadeaux (produits constatés d'avance)
create or replace function public.admin_gift_card_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_from timestamptz := app.local_ts(p_from, '00:00');
  v_to   timestamptz := app.local_ts(p_to + 1, '00:00');
begin
  perform app.require_owner();
  return jsonb_build_object(
    'issued_count', (select count(*) from public.gift_card_transactions t where t.kind = 'issue' and t.created_at >= v_from and t.created_at < v_to),
    'issued_cents', (select coalesce(sum(t.amount_cents), 0) from public.gift_card_transactions t where t.kind = 'issue' and t.created_at >= v_from and t.created_at < v_to),
    'redeemed_cents', (select coalesce(-sum(t.amount_cents), 0) from public.gift_card_transactions t where t.kind in ('redeem', 'refund') and t.created_at >= v_from and t.created_at < v_to),
    'expired_cents', (select coalesce(-sum(t.amount_cents), 0) from public.gift_card_transactions t where t.kind = 'expire' and t.created_at >= v_from and t.created_at < v_to),
    'adjusted_cents', (select coalesce(sum(t.amount_cents), 0) from public.gift_card_transactions t where t.kind = 'adjust' and t.created_at >= v_from and t.created_at < v_to),
    'outstanding_cents', (select coalesce(sum(g.balance_cents), 0) from public.gift_cards g where g.status = 'active' and g.expires_at > now()),
    'outstanding_count', (select count(*) from public.gift_cards g where g.status = 'active' and g.expires_at > now() and g.balance_cents > 0));
end;
$$;
