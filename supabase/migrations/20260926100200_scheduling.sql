-- =============================================================================
-- Karting Roussillon — 03 · Planning : horaires, créneaux, capacités,
-- blocages, calendrier droits de piste, événements
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Horaires d'ouverture. track_id null = tout le site.
-- Résolution pour (piste, jour) : lignes spécifiques à la piste > lignes site ;
-- à spécificité égale, priority la plus haute gagne (ex. horaires d'été).
-- -----------------------------------------------------------------------------
create table public.opening_hours (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid references public.tracks (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),   -- ISO : 1 = lundi
  opens_at   time not null,
  closes_at  time not null,
  is_closed  boolean not null default false,
  valid_from date,
  valid_to   date,
  priority   integer not null default 0,
  label      text not null default '',
  created_at timestamptz not null default now(),
  check (closes_at > opens_at),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index opening_hours_lookup_idx on public.opening_hours (weekday, track_id);

-- Horaires effectifs d'une piste un jour donné (0 ligne ou is_closed = fermé)
create or replace function app.opening_for(p_track_id uuid, p_day date)
returns table (opens_at time, closes_at time, is_closed boolean)
language sql stable security definer
set search_path = ''
as $$
  select oh.opens_at, oh.closes_at, oh.is_closed
  from public.opening_hours oh
  where oh.weekday = extract(isodow from p_day)::smallint
    and (oh.track_id = p_track_id or oh.track_id is null)
    and (oh.valid_from is null or oh.valid_from <= p_day)
    and (oh.valid_to   is null or oh.valid_to   >= p_day)
  order by (oh.track_id is not null) desc, oh.priority desc, oh.valid_from desc nulls last
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- Créneaux matérialisés (une ligne par piste et heure de départ).
-- La ligne slot sert de verrou (SELECT … FOR UPDATE) pour toute écriture
-- consommant de la capacité : holds, réservations, déplacements, blocages.
-- -----------------------------------------------------------------------------
create table public.slots (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  max_karts  integer check (max_karts > 0),   -- surcharge ponctuelle de tracks.max_karts_on_track
  is_active  boolean not null default true,
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (track_id, starts_at),
  check (ends_at > starts_at)
);
create index slots_starts_idx on public.slots (starts_at);

create table public.slot_capacities (
  slot_id         uuid not null references public.slots (id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types (id) on delete cascade,
  capacity        integer not null check (capacity >= 0),
  online_capacity integer not null check (online_capacity >= 0),
  is_override     boolean not null default false,  -- modifié à la main : la régénération ne l'écrase pas
  primary key (slot_id, vehicle_type_id),
  check (online_capacity <= capacity)
);
create index slot_capacities_vehicle_idx on public.slot_capacities (vehicle_type_id);

-- -----------------------------------------------------------------------------
-- Blocages & privatisations
-- Une ligne = une occurrence concrète. Les récurrences sont matérialisées à la
-- création (series_id commun, recurrence_rule recopiée pour affichage/édition).
-- -----------------------------------------------------------------------------
create table public.schedule_blocks (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null default gen_random_uuid(),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  block_type      public.block_type not null,
  reason          public.block_reason not null,
  public_label    text,
  is_public       boolean not null default false,
  all_tracks      boolean not null default false,       -- privatisation complète du site
  recurrence_rule text,                                 -- RRULE (sous-ensemble, cf. app.expand_rrule)
  event_id        uuid,                                 -- FK ajoutée après création de events
  request_id      uuid,                                 -- FK ajoutée après création de requests
  customer_id     uuid,                                 -- FK ajoutée après création de customers
  internal_note   text not null default '',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (not is_public or nullif(trim(public_label), '') is not null)
);
create index schedule_blocks_range_idx  on public.schedule_blocks using gist (tstzrange(starts_at, ends_at, '[)'));
create index schedule_blocks_series_idx on public.schedule_blocks (series_id);
create trigger schedule_blocks_touch before update on public.schedule_blocks
  for each row execute function app.touch_updated_at();

create table public.schedule_block_tracks (
  block_id uuid not null references public.schedule_blocks (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  primary key (block_id, track_id)
);
create index schedule_block_tracks_track_idx on public.schedule_block_tracks (track_id);

-- Un créneau (piste, plage) chevauche-t-il un blocage ?
create or replace function app.is_blocked(p_track_id uuid, p_starts timestamptz, p_ends timestamptz)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_blocks b
    where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')
      and (b.all_tracks
           or exists (select 1 from public.schedule_block_tracks bt
                      where bt.block_id = b.id and bt.track_id = p_track_id))
  )
$$;

-- -----------------------------------------------------------------------------
-- Calendrier public des droits de piste (Circuit 2 notamment)
-- -----------------------------------------------------------------------------
create table public.track_access_calendar (
  track_id     uuid not null references public.tracks (id) on delete cascade,
  day          date not null,
  status       public.track_access_status not null,
  public_label text not null default '',
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (track_id, day)
);

-- -----------------------------------------------------------------------------
-- Événements (trackdays, compétitions…) avec places
-- -----------------------------------------------------------------------------
create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title                text not null,
  kind                 public.event_kind not null default 'trackday',
  category             public.event_category not null default 'mixed',
  description          text not null default '',
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  capacity             integer not null default 0 check (capacity >= 0),
  price_cents          integer check (price_cents >= 0),
  vat_rate_bp          integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  requires_own_vehicle boolean not null default true,
  is_published         boolean not null default false,
  is_bookable          boolean not null default false,
  image_path           text,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at),
  check (not is_bookable or price_cents is not null)
);
create index events_starts_idx on public.events (starts_at);
create trigger events_touch before update on public.events
  for each row execute function app.touch_updated_at();

create table public.event_tracks (
  event_id uuid not null references public.events (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  primary key (event_id, track_id)
);

alter table public.schedule_blocks
  add constraint schedule_blocks_event_fk foreign key (event_id) references public.events (id) on delete set null;
create index schedule_blocks_event_idx on public.schedule_blocks (event_id);

-- -----------------------------------------------------------------------------
-- Expansion d'une RRULE (sous-ensemble RFC 5545) en occurrences locales.
-- Supporté : FREQ=DAILY|WEEKLY ; INTERVAL ; BYDAY=MO,TU,… ; BYMONTH=1,2,… ;
--            UNTIL=YYYYMMDD ; COUNT. UNTIL ou COUNT obligatoire. 366 occ. max.
-- Les heures locales sont conservées (changements d'heure gérés).
-- -----------------------------------------------------------------------------
create or replace function app.expand_rrule(p_starts timestamptz, p_ends timestamptz, p_rrule text)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable
set search_path = ''
as $$
declare
  v_parts      text[];
  v_part       text;
  v_key        text;
  v_val        text;
  v_freq       text;
  v_interval   integer := 1;
  v_byday      integer[];
  v_bymonth    integer[];
  v_until      date;
  v_count      integer;
  v_local_s    timestamp := p_starts at time zone app.tz();
  v_local_e    timestamp := p_ends   at time zone app.tz();
  v_span_days  integer   := v_local_e::date - v_local_s::date;
  v_first      date      := v_local_s::date;
  v_day        date;
  v_emitted    integer   := 0;
  v_max        constant integer := 366;
  v_week_index integer;
begin
  if p_rrule is null or trim(p_rrule) = '' then
    starts_at := p_starts; ends_at := p_ends; return next; return;
  end if;

  v_parts := string_to_array(upper(regexp_replace(p_rrule, '^RRULE:', '', 'i')), ';');
  foreach v_part in array v_parts loop
    v_key := split_part(v_part, '=', 1);
    v_val := split_part(v_part, '=', 2);
    case v_key
      when 'FREQ' then v_freq := v_val;
      when 'INTERVAL' then v_interval := v_val::integer;
      when 'COUNT' then v_count := v_val::integer;
      when 'UNTIL' then v_until := to_date(left(v_val, 8), 'YYYYMMDD');
      when 'BYDAY' then
        select array_agg(case d when 'MO' then 1 when 'TU' then 2 when 'WE' then 3 when 'TH' then 4
                                 when 'FR' then 5 when 'SA' then 6 when 'SU' then 7 end)
          into v_byday from unnest(string_to_array(v_val, ',')) d;
        if array_position(v_byday, null) is not null then
          perform app.fail('KR_RRULE_INVALID', 'BYDAY invalide : ' || v_val);
        end if;
      when 'BYMONTH' then
        select array_agg(m::integer) into v_bymonth from unnest(string_to_array(v_val, ',')) m;
      when '' then null;
      else perform app.fail('KR_RRULE_UNSUPPORTED', 'Règle non supportée : ' || v_key);
    end case;
  end loop;

  if v_freq not in ('DAILY', 'WEEKLY') then
    perform app.fail('KR_RRULE_UNSUPPORTED', 'Seules les fréquences DAILY et WEEKLY sont supportées.');
  end if;
  if v_until is null and v_count is null then
    perform app.fail('KR_RRULE_INVALID', 'Une récurrence doit avoir une date de fin (UNTIL) ou un nombre (COUNT).');
  end if;
  if v_interval < 1 then
    perform app.fail('KR_RRULE_INVALID', 'INTERVAL doit être ≥ 1.');
  end if;
  if v_freq = 'WEEKLY' and v_byday is null then
    v_byday := array[extract(isodow from v_first)::integer];
  end if;

  v_day := v_first;
  while v_emitted < coalesce(v_count, v_max) and v_emitted < v_max
        and (v_until is null or v_day <= v_until)
        and v_day <= v_first + 3660 loop
    if v_freq = 'DAILY' then
      if (v_day - v_first) % v_interval = 0
         and (v_bymonth is null or extract(month from v_day)::integer = any (v_bymonth))
         and (v_byday is null or extract(isodow from v_day)::integer = any (v_byday)) then
        starts_at := ((v_day + v_local_s::time)::timestamp) at time zone app.tz();
        ends_at   := ((v_day + v_span_days + v_local_e::time)::timestamp) at time zone app.tz();
        v_emitted := v_emitted + 1;
        return next;
      end if;
    else -- WEEKLY : semaines comptées à partir du lundi de la semaine de départ
      v_week_index := ((v_day - extract(isodow from v_day)::integer) - (v_first - extract(isodow from v_first)::integer)) / 7;
      if v_week_index % v_interval = 0
         and extract(isodow from v_day)::integer = any (v_byday)
         and (v_bymonth is null or extract(month from v_day)::integer = any (v_bymonth)) then
        starts_at := ((v_day + v_local_s::time)::timestamp) at time zone app.tz();
        ends_at   := ((v_day + v_span_days + v_local_e::time)::timestamp) at time zone app.tz();
        v_emitted := v_emitted + 1;
        return next;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
end;
$$;
