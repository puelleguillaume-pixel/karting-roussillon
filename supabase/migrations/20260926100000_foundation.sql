-- =============================================================================
-- Karting Roussillon — 01 · Fondations
-- Schéma interne `app` (non exposé par PostgREST), types énumérés, helpers.
-- Conventions :
--   * montants en centimes (integer), dates en timestamptz, fuseau Europe/Paris
--   * toute écriture passe par une RPC SECURITY DEFINER avec search_path = ''
--   * erreurs métier : SQLSTATE P0001, message = code stable "KR_…" (mappé côté front)
-- =============================================================================

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.app_role            as enum ('owner', 'staff');
create type public.track_usage         as enum ('leisure', 'track_access', 'events', 'baby');
create type public.track_access_status as enum ('open', 'restricted', 'closed', 'trackday', 'private');
create type public.product_kind        as enum ('session', 'pack', 'experience', 'on_request');
create type public.booking_status      as enum ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'reschedule_required');
create type public.booking_source      as enum ('online', 'phone', 'counter', 'admin');
create type public.participant_role    as enum ('driver', 'passenger');
create type public.block_type          as enum ('full_day', 'morning', 'afternoon', 'custom');
create type public.block_reason        as enum ('private_event', 'team_building', 'trackday', 'competition', 'maintenance', 'weather', 'other');
create type public.request_type        as enum ('birthday', 'bachelor_party', 'team_building', 'school_kart', 'school_moto', 'alpine', 'other');
create type public.request_status      as enum ('new', 'quoted', 'confirmed', 'paid', 'cancelled', 'lost');
create type public.payment_method      as enum ('cash', 'card', 'check', 'ancv', 'transfer', 'stripe', 'other');
create type public.payment_kind        as enum ('payment', 'refund');
create type public.gift_card_kind      as enum ('amount', 'product');
create type public.gift_card_status    as enum ('pending_payment', 'active', 'exhausted', 'expired', 'disabled');
create type public.gift_card_source    as enum ('sale', 'manual', 'credit');
create type public.gift_tx_kind        as enum ('issue', 'redeem', 'refund', 'adjust', 'expire');
create type public.event_kind          as enum ('trackday', 'competition', 'event');
create type public.event_category      as enum ('auto', 'moto', 'kart', 'mixed');
create type public.email_status        as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

-- -----------------------------------------------------------------------------
-- Helpers génériques
-- -----------------------------------------------------------------------------

-- Fuseau horaire métier, unique source de vérité.
create or replace function app.tz()
returns text language sql immutable parallel safe
set search_path = ''
as $$ select 'Europe/Paris'::text $$;

-- Date + heure locales (Paris) -> timestamptz
create or replace function app.local_ts(p_day date, p_time time)
returns timestamptz language sql stable parallel safe
set search_path = ''
as $$ select ((p_day + p_time)::timestamp at time zone app.tz()) $$;

-- Date locale (Paris) d'un instant
create or replace function app.local_date(p_ts timestamptz)
returns date language sql stable parallel safe
set search_path = ''
as $$ select (p_ts at time zone app.tz())::date $$;

-- Âge révolu à une date donnée
create or replace function app.age_on(p_birth date, p_on date)
returns integer language sql immutable parallel safe
set search_path = ''
as $$ select extract(year from age(p_on, p_birth))::integer $$;

-- Normalisation d'un nom (minuscules, sans accents, espaces compactés)
create or replace function app.normalize_name(p text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select regexp_replace(
           translate(lower(trim(coalesce(p, ''))),
                     'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ''-',
                     'aaaaaaceeeeiiiinooooouuuuyyoa  '),
           '\s+', ' ', 'g')
$$;

-- Clé d'identité pilote : nom + prénom normalisés + date de naissance.
-- Sert à détecter un même pilote sur deux sessions simultanées et à rattacher
-- la validation chrono.
create or replace function app.pilot_key(p_first text, p_last text, p_birth date)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select md5(app.normalize_name(p_first) || '|' || app.normalize_name(p_last) || '|' || coalesce(p_birth::text, ''))
$$;

-- Code aléatoire sans caractères ambigus (pas de 0/O, 1/I/L).
-- Source d'aléa : gen_random_uuid() (v4, CSPRNG), sans dépendance à pgcrypto.
create or replace function app.random_code(p_len integer)
returns text language plpgsql volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := ''::bytea;
  v_out text := '';
  i integer;
begin
  while length(v_bytes) < p_len loop
    v_bytes := v_bytes || uuid_send(gen_random_uuid());
  end loop;
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_out;
end;
$$;

-- Lève une erreur métier au format standard.
create or replace function app.fail(p_code text, p_hint text default null, p_detail text default null)
returns void language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    hint    = coalesce(p_hint, ''),
    detail  = coalesce(p_detail, '');
end;
$$;

-- Trigger updated_at
create or replace function app.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
