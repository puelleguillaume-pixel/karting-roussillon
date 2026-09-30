-- =============================================================================
-- Karting Roussillon — 04 · Clients, réservations, participants, holds,
-- paiements (enregistrés sur place), bons cadeaux, demandes, file d'emails
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clients (et registre des pilotes : la validation chrono est portée ici)
-- -----------------------------------------------------------------------------
create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid unique references auth.users (id) on delete set null,
  -- null autorisé uniquement pour les clients saisis au comptoir sans email
  email               text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name          text not null default '',
  last_name           text not null default '',
  phone               text not null default '',
  birth_date          date,
  company             text not null default '',
  pilot_key           text,
  chrono_validated    boolean not null default false,
  chrono_validated_at timestamptz,
  chrono_validated_by uuid references auth.users (id) on delete set null,
  marketing_opt_in    boolean not null default false,
  internal_notes      text not null default '',
  anonymized_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index customers_email_uidx on public.customers (lower(email));
create index customers_pilot_key_idx on public.customers (pilot_key) where pilot_key is not null;
create index customers_name_idx on public.customers (lower(last_name), lower(first_name));

create or replace function app.customers_derive()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.pilot_key := case when new.birth_date is not null and new.last_name <> ''
                        then app.pilot_key(new.first_name, new.last_name, new.birth_date) end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger customers_derive before insert or update on public.customers
  for each row execute function app.customers_derive();

create or replace function app.current_customer_id()
returns uuid language sql stable security definer
set search_path = ''
as $$ select c.id from public.customers c where c.auth_user_id = auth.uid() $$;

alter table public.schedule_blocks
  add constraint schedule_blocks_customer_fk foreign key (customer_id) references public.customers (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Demandes (anniversaires, EVG/EVJF, team building, école, Alpine…)
-- -----------------------------------------------------------------------------
create table public.requests (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  type              public.request_type not null,
  status            public.request_status not null default 'new',
  product_id        uuid references public.products (id) on delete set null,
  customer_id       uuid not null references public.customers (id) on delete restrict,
  contact_name      text not null,
  contact_email     text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone     text not null default '',
  company           text not null default '',
  preferred_date    date,
  alternative_date  date,
  participants_count integer check (participants_count between 1 and 500),
  message           text not null default '' check (length(message) <= 5000),
  details           jsonb not null default '{}'::jsonb,
  quote_amount_cents integer check (quote_amount_cents >= 0),
  deposit_cents     integer check (deposit_cents >= 0),
  internal_note     text not null default '',
  schedule_block_id uuid references public.schedule_blocks (id) on delete set null,
  assigned_to       uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index requests_status_idx on public.requests (status, created_at desc);
create index requests_customer_idx on public.requests (customer_id);
create trigger requests_touch before update on public.requests
  for each row execute function app.touch_updated_at();

alter table public.schedule_blocks
  add constraint schedule_blocks_request_fk foreign key (request_id) references public.requests (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Décharges de responsabilité (versionnées)
-- -----------------------------------------------------------------------------
create table public.waiver_versions (
  version    integer primary key,
  title      text not null,
  body       text not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index waiver_versions_current_uidx on public.waiver_versions (is_current) where is_current;

-- -----------------------------------------------------------------------------
-- Réservations
-- -----------------------------------------------------------------------------
create table public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  reference              text not null unique,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  product_id             uuid references public.products (id) on delete restrict,
  event_id               uuid references public.events (id) on delete restrict,
  request_id             uuid references public.requests (id) on delete set null,
  status                 public.booking_status not null default 'confirmed',
  source                 public.booking_source not null default 'online',
  starts_at              timestamptz not null,           -- début de la 1re session (dénormalisé)
  booking_date           date not null,                  -- date locale de starts_at
  karts                  integer not null default 0 check (karts >= 0),
  participants_count     integer not null check (participants_count >= 1),
  unit_price_cents       integer not null check (unit_price_cents >= 0),
  total_cents            integer not null check (total_cents >= 0),
  vat_rate_bp            integer not null default 2000,
  gift_card_applied_cents integer not null default 0 check (gift_card_applied_cents >= 0),
  qr_token               uuid not null unique default gen_random_uuid(),
  waiver_version         integer references public.waiver_versions (version),
  terms_accepted_at      timestamptz,
  customer_note          text not null default '' check (length(customer_note) <= 2000),
  internal_note          text not null default '',
  cancelled_at           timestamptz,
  cancelled_by           uuid references auth.users (id) on delete set null,
  cancel_reason          text,
  -- full_refund | credit | none | refund_due (remboursement sur place à effectuer)
  cancellation_outcome   text,
  reminder_sent_at       timestamptz,
  checked_in_at          timestamptz,
  created_by             uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (num_nonnulls(product_id, event_id) = 1),
  check (gift_card_applied_cents <= total_cents)
);
create index bookings_date_idx     on public.bookings (booking_date, status);
create index bookings_customer_idx on public.bookings (customer_id, starts_at desc);
create index bookings_event_idx    on public.bookings (event_id) where event_id is not null;
create index bookings_starts_idx   on public.bookings (starts_at);
create trigger bookings_touch before update on public.bookings
  for each row execute function app.touch_updated_at();

-- Statuts qui consomment de la capacité
create or replace function app.is_active_status(p public.booking_status)
returns boolean language sql immutable parallel safe
set search_path = ''
as $$ select p in ('pending', 'confirmed', 'checked_in', 'completed', 'reschedule_required') $$;

-- Sessions (créneaux) d'une réservation : 1 pour une session, N pour un pack
create table public.booking_sessions (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  slot_id         uuid not null references public.slots (id) on delete restrict,
  vehicle_type_id uuid not null references public.vehicle_types (id) on delete restrict,
  karts           integer not null check (karts >= 1),
  seq             integer not null default 1,
  unique (booking_id, slot_id)
);
create index booking_sessions_slot_idx on public.booking_sessions (slot_id, vehicle_type_id);

create table public.booking_participants (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  customer_id      uuid references public.customers (id) on delete set null,
  role             public.participant_role not null default 'driver',
  first_name       text not null,
  last_name        text not null,
  birth_date       date not null,
  height_cm        integer check (height_cm between 50 and 250),
  height_certified boolean not null default false,
  pilot_key        text not null,
  extra            jsonb not null default '{}'::jsonb,   -- trackday : véhicule, licence…
  waiver_signed_at timestamptz,
  waiver_signed_by text,                                 -- représentant légal si mineur
  waiver_version   integer references public.waiver_versions (version),
  checked_in_at    timestamptz,
  created_at       timestamptz not null default now()
);
create index booking_participants_booking_idx on public.booking_participants (booking_id);
create index booking_participants_pilot_idx   on public.booking_participants (pilot_key);

-- Blocage temporaire de capacité pendant le parcours de réservation
create table public.booking_holds (
  id              uuid primary key default gen_random_uuid(),
  hold_token      uuid not null,
  product_id      uuid not null references public.products (id) on delete cascade,
  slot_id         uuid not null references public.slots (id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types (id) on delete cascade,
  karts           integer not null check (karts >= 1),
  seq             integer not null default 1,
  booking_id      uuid references public.bookings (id) on delete cascade,  -- hold de report
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index booking_holds_token_idx on public.booking_holds (hold_token);
create index booking_holds_slot_idx  on public.booking_holds (slot_id, expires_at);

-- -----------------------------------------------------------------------------
-- Bons cadeaux
-- -----------------------------------------------------------------------------
create table public.gift_cards (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  kind                  public.gift_card_kind not null,
  source                public.gift_card_source not null default 'sale',
  product_id            uuid references public.products (id) on delete restrict,
  initial_amount_cents  integer not null check (initial_amount_cents > 0),
  balance_cents         integer not null check (balance_cents >= 0),
  status                public.gift_card_status not null default 'pending_payment',
  purchaser_customer_id uuid references public.customers (id) on delete set null,
  recipient_name        text not null default '',
  recipient_email       text,
  message               text not null default '' check (length(message) <= 1000),
  origin_booking_id     uuid references public.bookings (id) on delete set null, -- avoir suite à annulation
  issued_at             timestamptz,
  expires_at            timestamptz,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (kind = 'amount' or product_id is not null),
  check (balance_cents <= initial_amount_cents),
  check (status = 'pending_payment' or (issued_at is not null and expires_at is not null))
);
create index gift_cards_purchaser_idx on public.gift_cards (purchaser_customer_id);
create index gift_cards_status_idx on public.gift_cards (status, expires_at);
create trigger gift_cards_touch before update on public.gift_cards
  for each row execute function app.touch_updated_at();

create table public.gift_card_transactions (
  id           uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards (id) on delete restrict,
  booking_id   uuid references public.bookings (id) on delete set null,
  kind         public.gift_tx_kind not null,
  amount_cents integer not null,           -- + crédit / − débit
  balance_after_cents integer not null check (balance_after_cents >= 0),
  note         text not null default '',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index gift_card_tx_card_idx on public.gift_card_transactions (gift_card_id, created_at);
create index gift_card_tx_booking_idx on public.gift_card_transactions (booking_id) where booking_id is not null;

-- -----------------------------------------------------------------------------
-- Paiements (encaissements et remboursements enregistrés par le personnel ;
-- colonnes Stripe prêtes pour une activation ultérieure du paiement en ligne)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid references public.bookings (id) on delete restrict,
  request_id            uuid references public.requests (id) on delete restrict,
  gift_card_id          uuid references public.gift_cards (id) on delete restrict, -- vente de bon (produit constaté d'avance)
  kind                  public.payment_kind not null default 'payment',
  method                public.payment_method not null,
  amount_cents          integer not null check (amount_cents > 0),  -- toujours positif ; le sens est donné par kind
  vat_rate_bp           integer not null default 2000,
  vat_cents             integer not null,
  stripe_payment_intent text,
  stripe_charge_id      text,
  note                  text not null default '',
  recorded_by           uuid references auth.users (id) on delete set null,
  paid_at               timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  check (num_nonnulls(booking_id, request_id, gift_card_id) = 1)
);
create index payments_paid_at_idx on public.payments (paid_at);
create index payments_booking_idx on public.payments (booking_id) where booking_id is not null;
create index payments_request_idx on public.payments (request_id) where request_id is not null;

-- Montant net encaissé pour une réservation (hors bons cadeaux)
create or replace function app.booking_paid_cents(p_booking_id uuid)
returns integer language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(case when p.kind = 'payment' then p.amount_cents else -p.amount_cents end), 0)::integer
  from public.payments p where p.booking_id = p_booking_id
$$;

-- -----------------------------------------------------------------------------
-- File d'emails transactionnels (consommée par une Edge Function → Apps Script)
-- -----------------------------------------------------------------------------
create table public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  template    text not null,
  to_email    text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      public.email_status not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index email_outbox_pending_idx on public.email_outbox (send_after) where status = 'pending';

create or replace function app.enqueue_email(p_template text, p_to text, p_payload jsonb)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if p_to is null or trim(p_to) = '' then
    return;  -- destinataire non configuré (ex. notify_email vide) : on n'échoue pas la transaction
  end if;
  insert into public.email_outbox (template, to_email, payload) values (p_template, lower(trim(p_to)), p_payload);
end;
$$;
