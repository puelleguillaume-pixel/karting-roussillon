-- =============================================================================
-- Karting Roussillon — 13 · Parcours de réservation, compte client, emails
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lecture publique complémentaire
-- -----------------------------------------------------------------------------

-- Texte de la décharge en vigueur (affiché avant confirmation)
create or replace function public.get_current_waiver()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('version', w.version, 'title', w.title, 'body', w.body)
  from public.waiver_versions w where w.is_current
$$;

-- Fiche publique d'un événement (page de réservation de places)
create or replace function public.get_event_public(p_slug text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'slug', e.slug, 'title', e.title, 'kind', e.kind, 'category', e.category,
    'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'capacity', e.capacity, 'price_cents', e.price_cents, 'requires_own_vehicle', e.requires_own_vehicle,
    'is_bookable', e.is_bookable and e.starts_at > now() and e.price_cents is not null,
    'places_left', greatest(e.capacity - coalesce((
        select sum(b.participants_count) from public.bookings b
        where b.event_id = e.id and app.is_active_status(b.status)), 0), 0),
    'tracks', coalesce((
        select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.short_name, 'length_m', t.length_m) order by t.sort_order)
        from public.event_tracks et join public.tracks t on t.id = et.track_id
        where et.event_id = e.id), '[]'::jsonb))
  from public.events e
  where e.slug = p_slug and e.is_published
$$;

-- -----------------------------------------------------------------------------
-- Compte client
-- -----------------------------------------------------------------------------
create or replace function public.my_profile()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone)
  from public.customers c
  where c.auth_user_id = auth.uid() and auth.uid() is not null
$$;

create or replace function public.my_gift_cards()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', g.code, 'kind', g.kind, 'status', g.status,
           'initial_amount_cents', g.initial_amount_cents, 'balance_cents', g.balance_cents,
           'expires_at', g.expires_at, 'recipient_name', g.recipient_name,
           'product', (select p.name from public.products p where p.id = g.product_id))
         order by g.created_at desc), '[]'::jsonb)
  from public.gift_cards g
  where g.purchaser_customer_id = app.current_customer_id() and auth.uid() is not null
$$;

-- -----------------------------------------------------------------------------
-- File d'emails : consommation par l'Edge Function `send-emails` (service_role)
-- -----------------------------------------------------------------------------
alter table public.email_outbox add column claimed_at timestamptz;

-- Réserve un lot d'emails à envoyer (verrouillage SKIP LOCKED : plusieurs
-- exécutions simultanées ne se marchent pas dessus). Les envois restés
-- « en cours » plus de 10 minutes (fonction interrompue) sont remis en file.
create or replace function public.email_claim_batch(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.email_outbox
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select q.id from public.email_outbox q
     where q.status = 'pending' and q.send_after <= now()
     order by q.send_after
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked)
  returning o.*;
end;
$$;

-- Résultat d'un envoi : succès, nouvel essai différé (2, 4, 8, 16 min) ou échec définitif
create or replace function public.email_mark_result(p_id uuid, p_ok boolean, p_error text default null)
returns void language sql volatile security definer
set search_path = ''
as $$
  update public.email_outbox o set
    status = case when p_ok then 'sent' when o.attempts >= 5 then 'failed' else 'pending' end::public.email_status,
    sent_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(coalesce(p_error, 'Erreur inconnue'), 1000) end,
    send_after = case when p_ok then o.send_after else now() + make_interval(mins => power(2, o.attempts)::integer) end,
    claimed_at = null
  where o.id = p_id and o.status = 'sending'
$$;

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
revoke execute on function public.get_current_waiver(), public.get_event_public(text),
  public.my_profile(), public.my_gift_cards(),
  public.email_claim_batch(integer), public.email_mark_result(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.get_current_waiver(), public.get_event_public(text) to anon, authenticated;
grant execute on function public.my_profile(), public.my_gift_cards() to authenticated;
grant execute on function public.email_claim_batch(integer), public.email_mark_result(uuid, boolean, text) to service_role;

-- -----------------------------------------------------------------------------
-- Déclenchement de l'envoi toutes les minutes (pg_cron + pg_net), uniquement
-- s'il y a des emails en attente. URL et clés sont lues dans Supabase Vault :
--   kr_functions_url          https://<ref>.supabase.co/functions/v1
--   kr_service_role_key       clé service_role du projet
--   kr_email_dispatch_secret  secret partagé avec la fonction (EMAIL_DISPATCH_SECRET)
-- (voir supabase/README.md, section Emails)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    perform cron.schedule('kr_send_emails', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'kr_functions_url') || '/send-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kr_service_role_key'),
          'x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kr_email_dispatch_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      where exists (select 1 from public.email_outbox where status = 'pending' and send_after <= now())
    $job$);
  else
    raise notice 'pg_cron / pg_net indisponibles : envoi automatique des emails non planifié.';
  end if;
end;
$$;
