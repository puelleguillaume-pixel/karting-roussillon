-- =============================================================================
-- Karting Roussillon — 08 · Génération des créneaux, blocages & privatisations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (Re)génère les créneaux d'une période à partir des horaires et des capacités
-- modèles. Idempotent. Les créneaux futurs devenus hors horaires sont
-- supprimés s'ils sont vides ; ceux qui portent des réservations sont conservés.
-- Les capacités modifiées à la main (is_override) ne sont pas écrasées.
-- -----------------------------------------------------------------------------
create or replace function app.generate_slots(p_from date, p_to date)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_default_quota integer := app.setting_int('default_online_quota_pct', 50);
begin
  if p_to < p_from or p_to - p_from > 400 then
    perform app.fail('KR_RANGE_INVALID', 'Période de 400 jours maximum.');
  end if;

  create temporary table if not exists _desired_slots (
    track_id uuid, starts_at timestamptz, ends_at timestamptz
  ) on commit drop;
  truncate pg_temp._desired_slots;

  insert into pg_temp._desired_slots (track_id, starts_at, ends_at)
  select t.id, gs, gs + make_interval(mins => t.session_min)
  from generate_series(p_from, p_to, interval '1 day') d
  cross join public.tracks t
  cross join lateral app.opening_for(t.id, d::date) o
  cross join lateral generate_series(
      app.local_ts(d::date, o.opens_at),
      app.local_ts(d::date, o.closes_at) - make_interval(mins => t.session_min),
      make_interval(mins => t.slot_interval_min)) gs
  where t.is_active and not o.is_closed
    -- pas de créneaux sur une piste sans flotte affectée (ex. Circuit 3 : événements uniquement)
    and exists (select 1 from public.track_vehicle_capacities c where c.track_id = t.id and c.capacity > 0);

  -- Créneaux futurs, vides et plus prévus : supprimés
  delete from public.slots s
  where s.starts_at >= app.local_ts(p_from, '00:00')
    and s.starts_at <  app.local_ts(p_to + 1, '00:00')
    and s.starts_at > now()
    and not exists (select 1 from pg_temp._desired_slots d where d.track_id = s.track_id and d.starts_at = s.starts_at)
    and not exists (select 1 from public.booking_sessions bs where bs.slot_id = s.id)
    and not exists (select 1 from public.booking_holds h where h.slot_id = s.id);

  insert into public.slots (track_id, starts_at, ends_at)
  select d.track_id, d.starts_at, d.ends_at from pg_temp._desired_slots d
  on conflict (track_id, starts_at) do update set ends_at = excluded.ends_at
    where public.slots.ends_at <> excluded.ends_at;
  get diagnostics v_inserted = row_count;

  insert into public.slot_capacities (slot_id, vehicle_type_id, capacity, online_capacity)
  select s.id, c.vehicle_type_id, c.capacity,
         floor(c.capacity * coalesce(c.online_quota_pct, v_default_quota) / 100.0)::integer
  from public.slots s
  join public.track_vehicle_capacities c on c.track_id = s.track_id
  join public.vehicle_types v on v.id = c.vehicle_type_id and v.is_active
  where s.starts_at >= app.local_ts(p_from, '00:00')
    and s.starts_at <  app.local_ts(p_to + 1, '00:00')
    and s.starts_at > now()
  on conflict (slot_id, vehicle_type_id) do update
    set capacity = excluded.capacity, online_capacity = excluded.online_capacity
    where not public.slot_capacities.is_override;

  -- Catégories retirées d'une piste : capacité ramenée à 0 (pas de suppression, historique conservé)
  update public.slot_capacities sc
     set capacity = 0, online_capacity = 0
    from public.slots s
   where s.id = sc.slot_id
     and s.starts_at >= app.local_ts(p_from, '00:00')
     and s.starts_at <  app.local_ts(p_to + 1, '00:00')
     and s.starts_at > now()
     and not sc.is_override
     and not exists (select 1 from public.track_vehicle_capacities c
                     join public.vehicle_types v on v.id = c.vehicle_type_id and v.is_active
                     where c.track_id = s.track_id and c.vehicle_type_id = sc.vehicle_type_id);

  return v_inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Blocages : calcul des occurrences et des conflits
-- -----------------------------------------------------------------------------

-- Plage de base d'un blocage à partir de son type (bornes des demi-journées
-- paramétrables), puis expansion de la récurrence.
create or replace function app.block_occurrences(p jsonb)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_type   public.block_type := (p ->> 'block_type')::public.block_type;
  v_day    date;
  v_starts timestamptz;
  v_ends   timestamptz;
begin
  if v_type = 'custom' then
    v_starts := (p ->> 'starts_at')::timestamptz;
    v_ends   := (p ->> 'ends_at')::timestamptz;
  else
    v_day := (p ->> 'date')::date;
    if v_day is null then
      perform app.fail('KR_BLOCK_INVALID', 'La date du blocage est obligatoire.');
    end if;
    case v_type
      when 'full_day' then
        v_starts := app.local_ts(v_day, '00:00');
        v_ends   := app.local_ts(v_day + 1, '00:00');
      when 'morning' then
        v_starts := app.local_ts(v_day, app.setting_time('morning_start', '09:00'));
        v_ends   := app.local_ts(v_day, app.setting_time('morning_end', '13:00'));
      when 'afternoon' then
        v_starts := app.local_ts(v_day, app.setting_time('afternoon_start', '13:00'));
        v_ends   := app.local_ts(v_day, app.setting_time('afternoon_end', '19:00'));
    end case;
  end if;
  if v_starts is null or v_ends is null or v_ends <= v_starts then
    perform app.fail('KR_BLOCK_INVALID', 'Plage horaire du blocage invalide.');
  end if;
  return query select o.starts_at, o.ends_at from app.expand_rrule(v_starts, v_ends, nullif(p ->> 'recurrence_rule', '')) o;
end;
$$;

-- Réservations actives (futures) impactées par des plages sur des pistes.
create or replace function app.block_conflicts(
  p_ranges tstzrange[], p_track_ids uuid[], p_all_tracks boolean, p_exclude_booking_ids uuid[] default '{}')
returns table (
  booking_id uuid, reference text, status public.booking_status, starts_at timestamptz,
  product_name text, karts integer, participants_count integer,
  customer_name text, customer_email text, customer_phone text,
  within_warning_window boolean)
language sql stable security definer
set search_path = ''
as $$
  select b.id, b.reference, b.status, b.starts_at, pr.name, b.karts, b.participants_count,
         trim(c.first_name || ' ' || c.last_name), c.email, c.phone,
         b.starts_at < now() + make_interval(hours => app.setting_int('block_warning_hours', 72))
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  left join public.products pr on pr.id = b.product_id
  where b.status in ('pending', 'confirmed', 'reschedule_required')
    and b.id <> all (coalesce(p_exclude_booking_ids, '{}'))
    and exists (
      select 1
      from public.booking_sessions bs
      join public.slots sl on sl.id = bs.slot_id
      where bs.booking_id = b.id
        and sl.ends_at > now()
        and (p_all_tracks or sl.track_id = any (p_track_ids))
        and exists (select 1 from unnest(p_ranges) r where r && tstzrange(sl.starts_at, sl.ends_at, '[)')))
  order by b.starts_at
$$;

-- Verrouille les créneaux couverts par des plages (sérialise avec les réservations)
-- (plpgsql + PERFORM : la requête est exécutée jusqu'au bout, toutes les lignes sont verrouillées)
create or replace function app.lock_slots_in_ranges(p_ranges tstzrange[], p_track_ids uuid[], p_all_tracks boolean)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform 1 from public.slots sl
  where (p_all_tracks or sl.track_id = any (p_track_ids))
    and exists (select 1 from unnest(p_ranges) r where r && tstzrange(sl.starts_at, sl.ends_at, '[)'))
  order by sl.id
  for update;
end;
$$;

-- Applique les actions choisies sur les réservations en conflit.
-- p_actions = {"default": "keep"|"reschedule"|"cancel", "overrides": {"<booking_id>": "cancel", …}}
create or replace function app.apply_conflict_actions(p_conflicts uuid[], p_actions jsonb, p_label text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_action text;
  v_out    jsonb := '[]'::jsonb;
  v_json   jsonb;
begin
  foreach v_id in array coalesce(p_conflicts, '{}') loop
    v_action := coalesce(p_actions -> 'overrides' ->> v_id::text, p_actions ->> 'default');
    if v_action is null or v_action not in ('keep', 'reschedule', 'cancel') then
      perform app.fail('KR_CONFLICT_ACTION_REQUIRED', 'Choisissez une action pour chaque réservation impactée.', v_id::text);
    end if;
    if v_action = 'reschedule' then
      update public.bookings set status = 'reschedule_required' where id = v_id;
      v_json := app.booking_json(v_id);
      perform app.enqueue_email('booking_reschedule_required', v_json #>> '{customer,email}',
                                v_json || jsonb_build_object('reason', p_label));
    elsif v_action = 'cancel' then
      -- Annulation à l'initiative du circuit : restitution intégrale
      perform app.apply_cancellation(v_id, 'full_refund', 'Annulation circuit : ' || coalesce(p_label, ''),
                                     'booking_cancelled_by_circuit');
    end if;
    perform app.audit('block_conflict_' || v_action, 'booking', v_id::text, null,
                      jsonb_build_object('label', p_label));
    v_out := v_out || jsonb_build_object('booking_id', v_id, 'action', v_action);
  end loop;
  return v_out;
end;
$$;

-- Normalise l'entrée d'un blocage et renvoie pistes + occurrences
create or replace function app.parse_block_input(p jsonb, out track_ids uuid[], out all_tracks boolean, out ranges tstzrange[])
language plpgsql stable security definer
set search_path = ''
as $$
begin
  all_tracks := coalesce((p ->> 'all_tracks')::boolean, false);
  track_ids := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'track_ids', '[]'::jsonb))::uuid), '{}');
  if not all_tracks and cardinality(track_ids) = 0 then
    perform app.fail('KR_BLOCK_INVALID', 'Choisissez au moins une piste (ou tout le site).');
  end if;
  if not all_tracks and (select count(*) from public.tracks t where t.id = any (track_ids)) <> cardinality(track_ids) then
    perform app.fail('KR_BLOCK_INVALID', 'Piste inconnue.');
  end if;
  if p ->> 'reason' is null then
    perform app.fail('KR_BLOCK_INVALID', 'Le motif du blocage est obligatoire.');
  end if;
  if coalesce((p ->> 'is_public')::boolean, false) and nullif(trim(coalesce(p ->> 'public_label', '')), '') is null then
    perform app.fail('KR_BLOCK_INVALID', 'Un libellé public est requis pour afficher le blocage sur le site.');
  end if;
  ranges := array(select tstzrange(o.starts_at, o.ends_at, '[)') from app.block_occurrences(p) o order by o.starts_at);
  if cardinality(ranges) = 0 then
    perform app.fail('KR_BLOCK_INVALID', 'La récurrence ne produit aucune occurrence.');
  end if;
end;
$$;
