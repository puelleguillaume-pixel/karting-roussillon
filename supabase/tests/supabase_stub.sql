-- Bouchon minimal de l'environnement Supabase pour les tests locaux (PGlite).
-- Reproduit : rôles anon / authenticated / service_role, schéma auth,
-- auth.uid() et auth.jwt() lus depuis request.jwt.claims (comme PostgREST).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable
as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
