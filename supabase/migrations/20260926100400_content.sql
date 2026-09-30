-- =============================================================================
-- Karting Roussillon — 05 · Contenu éditorial, chronos, avis
-- =============================================================================

-- Textes clés, bannière d'info, coordonnées… (clé stable, contenu éditable)
create table public.site_content (
  key          text primary key check (key ~ '^[a-z0-9_.-]+$'),
  title        text not null default '',
  body         text not null default '',        -- Markdown
  data         jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- Meilleurs temps
create table public.lap_records (
  id              uuid primary key default gen_random_uuid(),
  track_id        uuid not null references public.tracks (id) on delete cascade,
  vehicle_type_id uuid references public.vehicle_types (id) on delete set null,
  category_label  text not null,                 -- libellé affiché (ex. "SodiKart 30 CV")
  driver_name     text not null,                 -- nom public (pseudo possible)
  customer_id     uuid references public.customers (id) on delete set null,
  lap_time_ms     integer not null check (lap_time_ms between 5000 and 3600000),
  recorded_on     date not null,
  is_published    boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index lap_records_board_idx on public.lap_records (track_id, category_label, lap_time_ms) where is_published;

-- Avis clients (saisis/importés par le dirigeant, jamais générés)
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  author_name  text not null,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null,
  source       text not null default 'google' check (source in ('google', 'facebook', 'site', 'other')),
  review_date  date,
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
