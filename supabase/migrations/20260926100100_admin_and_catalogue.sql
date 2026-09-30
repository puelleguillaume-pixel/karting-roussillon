-- =============================================================================
-- Karting Roussillon — 02 · Rôles, paramètres, audit, catalogue
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rôles du personnel (owner / staff). Un utilisateur Auth sans ligne ici = client.
-- -----------------------------------------------------------------------------
create table public.staff_roles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         public.app_role not null,
  display_name text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger staff_roles_touch before update on public.staff_roles
  for each row execute function app.touch_updated_at();

-- Rôle courant (null = pas membre du personnel)
create or replace function app.staff_role()
returns public.app_role language sql stable security definer
set search_path = ''
as $$
  select sr.role from public.staff_roles sr
  where sr.user_id = auth.uid() and sr.is_active
$$;

create or replace function app.is_staff()
returns boolean language sql stable security definer
set search_path = ''
as $$ select app.staff_role() is not null $$;

create or replace function app.is_owner()
returns boolean language sql stable security definer
set search_path = ''
as $$ select coalesce(app.staff_role() = 'owner', false) $$;

create or replace function app.require_staff()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.is_staff() then
    raise exception using errcode = '42501', message = 'KR_FORBIDDEN', hint = 'Accès réservé au personnel.';
  end if;
end;
$$;

create or replace function app.require_owner()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.is_owner() then
    raise exception using errcode = '42501', message = 'KR_FORBIDDEN', hint = 'Accès réservé au dirigeant.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Paramètres (clé / valeur JSON). is_public = lisible par le site.
-- -----------------------------------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text not null default '',
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create or replace function app.setting(p_key text)
returns jsonb language sql stable security definer
set search_path = ''
as $$ select s.value from public.settings s where s.key = p_key $$;

create or replace function app.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer
set search_path = ''
as $$ select coalesce((app.setting(p_key) #>> '{}')::integer, p_default) $$;

create or replace function app.setting_text(p_key text, p_default text default null)
returns text language sql stable security definer
set search_path = ''
as $$ select coalesce(nullif(app.setting(p_key) #>> '{}', ''), p_default) $$;

create or replace function app.setting_time(p_key text, p_default time)
returns time language sql stable security definer
set search_path = ''
as $$ select coalesce((app.setting(p_key) #>> '{}')::time, p_default) $$;

-- -----------------------------------------------------------------------------
-- Journal d'audit (toute action du personnel)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_role  public.app_role,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx  on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function app.audit(
  p_action text, p_entity text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null)
returns void language sql volatile security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), app.staff_role(), p_action, p_entity, p_entity_id, p_before, p_after)
$$;

-- -----------------------------------------------------------------------------
-- Pistes
-- -----------------------------------------------------------------------------
create table public.tracks (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                  text not null,
  short_name            text not null,
  length_m              integer check (length_m > 0),
  usage                 public.track_usage not null,
  min_age               integer check (min_age >= 0),
  description           text not null default '',
  requires_booking      boolean not null default false,
  online_booking_enabled boolean not null default true,
  -- Catégories de karts non mélangées sur une même session (voir vehicle_types.run_group)
  enforce_run_groups    boolean not null default true,
  -- Nombre total max de karts en piste par créneau (null = somme des capacités par catégorie)
  max_karts_on_track    integer check (max_karts_on_track > 0),
  slot_interval_min     integer not null default 15 check (slot_interval_min between 5 and 240),
  session_min           integer not null default 10 check (session_min between 1 and 240),
  display_on_circuits   boolean not null default true,
  image_path            text,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (session_min <= slot_interval_min)
);
create trigger tracks_touch before update on public.tracks
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Types de véhicules (flotte physique)
-- -----------------------------------------------------------------------------
create table public.vehicle_types (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                    text not null,
  engine                  text not null default '',
  description             text not null default '',
  min_age                 integer not null default 0 check (min_age >= 0),
  min_height_cm           integer check (min_height_cm between 50 and 250),
  seats                   integer not null default 1 check (seats in (1, 2)),
  passenger_min_age       integer check (passenger_min_age >= 0),
  passenger_min_height_cm integer check (passenger_min_height_cm between 50 and 250),
  is_adapted              boolean not null default false,   -- handikart (commande au volant)
  run_group               text not null default 'loisir',   -- catégories pouvant rouler ensemble
  fleet_count             integer not null default 0 check (fleet_count >= 0),
  image_path              text,
  sort_order              integer not null default 0,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (seats = 1 or passenger_min_age is not null)
);
create trigger vehicle_types_touch before update on public.vehicle_types
  for each row execute function app.touch_updated_at();

-- Capacité "modèle" par piste et catégorie (sert à générer slot_capacities).
-- La flotte est répartie par piste : la somme des capacités d'une catégorie
-- sur des pistes ouvertes simultanément ne doit pas dépasser fleet_count.
create table public.track_vehicle_capacities (
  track_id         uuid not null references public.tracks (id) on delete cascade,
  vehicle_type_id  uuid not null references public.vehicle_types (id) on delete cascade,
  capacity         integer not null check (capacity >= 0),
  online_quota_pct integer check (online_quota_pct between 0 and 100), -- null = paramètre global
  primary key (track_id, vehicle_type_id)
);

-- -----------------------------------------------------------------------------
-- Produits vendables
-- -----------------------------------------------------------------------------
create table public.products (
  id                         uuid primary key default gen_random_uuid(),
  slug                       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind                       public.product_kind not null,
  name                       text not null,
  short_description          text not null default '',
  description                text not null default '',
  vehicle_type_id            uuid references public.vehicle_types (id) on delete restrict,
  request_type               public.request_type,              -- pour kind = on_request / experience
  price_cents                integer check (price_cents >= 0),  -- null = sur devis / à définir
  price_label                text,                              -- ex. "Sur devis", "à partir de"
  vat_rate_bp                integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  duration_min               integer check (duration_min > 0),
  min_age                    integer check (min_age >= 0),      -- null = celui du véhicule
  min_height_cm              integer check (min_height_cm between 50 and 250),
  age_label                  text not null default '',          -- libellé affiché ("16 ans révolus")
  requires_chrono_validation boolean not null default false,
  is_online_bookable         boolean not null default false,
  active_months              smallint[] check (active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  metadata                   jsonb not null default '{}'::jsonb,
  image_path                 text,
  is_featured                boolean not null default false,
  sort_order                 integer not null default 0,
  is_active                  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (kind not in ('session', 'pack') or (vehicle_type_id is not null and price_cents is not null and duration_min is not null)),
  check (not is_online_bookable or kind in ('session', 'pack'))
);
create index products_vehicle_idx on public.products (vehicle_type_id);
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();

-- Pistes sur lesquelles un produit se pratique
create table public.product_tracks (
  product_id uuid not null references public.products (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  primary key (product_id, track_id)
);
create index product_tracks_track_idx on public.product_tracks (track_id);

-- Détail des packs (N sessions d'un même véhicule, le même jour)
create table public.packs (
  product_id      uuid primary key references public.products (id) on delete cascade,
  sessions_count  integer not null check (sessions_count between 2 and 10),
  session_min     integer not null check (session_min > 0),
  min_gap_min     integer not null default 0 check (min_gap_min >= 0), -- écart mini entre 2 sessions
  same_day        boolean not null default true
);

-- Le kind 'pack' doit avoir une ligne packs ; contrôlé dans les RPC d'admin.
